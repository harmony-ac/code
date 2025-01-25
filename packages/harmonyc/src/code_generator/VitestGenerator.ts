import { basename } from 'path'
import {
  Action,
  Arg,
  CodeGenerator,
  Feature,
  Phrase,
  Response,
  StringLiteral,
  Test,
  TestGroup,
  Word,
} from '../model/model.ts'
import { OutFile } from './outFile.ts'

export class VitestGenerator implements CodeGenerator {
  framework = 'vitest'
  phraseFns = new Map<string, Phrase>()
  currentFeatureName = ''
  constructor(private tf: OutFile, private sf: OutFile) {}

  feature(feature: Feature) {
    const phrasesModule = './' + basename(this.sf.name.replace(/.(js|ts)$/, ''))
    const fn = (this.currentFeatureName = pascalCase(feature.name))
    this.phraseFns = new Map<string, Phrase>()
    if (this.framework === 'vitest') {
      this.tf.print(`import { describe, test, expect } from 'vitest';`)
    }
    this.tf.print(`import ${fn}Phrases from ${str(phrasesModule)};`)
    this.tf.print(``)
    for (const item of feature.testGroups) {
      item.toCode(this)
    }
    this.sf.print(`export default class ${pascalCase(feature.name)}Phrases {`)
    this.sf.indent(() => {
      for (const ph of this.phraseFns.keys()) {
        const p = this.phraseFns.get(ph)!
        const params = p.args.map((a, i) => a.toDeclaration(this, i)).join(', ')
        this.sf.print(`async ${ph}(${params}) {`)
        this.sf.indent(() => {
          this.sf.print(`throw new Error(${str(`Pending: ${ph}`)});`)
        })
        this.sf.print(`}`)
      }
    })
    this.sf.print(`};`)
  }

  testGroup(g: TestGroup) {
    this.tf.print(`describe(${str(g.name)}, () => {`)
    this.tf.indent(() => {
      for (const item of g.items) {
        item.toCode(this)
      }
    })
    this.tf.print('});')
  }

  featureVars!: Map<string, string>
  resultCount = 0
  test(t: Test) {
    this.resultCount = 0
    this.featureVars = new Map()
    // avoid shadowing this import name
    this.featureVars.set(new Object() as any, this.currentFeatureName)
    this.tf.print(`test(${str(t.name)}, async (context) => {`)
    this.tf.indent(() => {
      this.tf.print(`context.task.meta.phrases ??= [];`)
      for (const step of t.steps) {
        step.toCode(this)
      }
    })
    this.tf.print('});')
  }

  errorStep(action: Action, errorMessage?: StringLiteral) {
    this.declareFeatureVariables([action])
    this.tf.print(`context.task.meta.phrases.push(${str(action.toString())});`)
    this.tf.print(
      `context.task.meta.phrases.push(${str(
        errorMessage ? '!! => ' + JSON.stringify(errorMessage.text) : '!!'
      )});`
    )
    this.tf.print(`await expect(async () => {`)
    this.tf.indent(() => {
      action.toCode(this)
    })
    this.tf.print(`}).rejects.toThrow(${errorMessage?.toCode(this) ?? ''});`)
  }

  extraArgs: string[] = []
  step(action: Action, responses: Response[]): void {
    this.declareFeatureVariables([action, ...responses])
    this.tf.print(`context.task.meta.phrases.push(${str(action.toString())});`)
    if (responses.length === 0) {
      action.toCode(this)
      return
    }
    const res = `r${this.resultCount++ || ''}`
    this.tf.print(`const ${res} =`)
    this.tf.indent(() => {
      action.toCode(this)
      try {
        this.extraArgs = [res]
        for (const response of responses) {
          this.tf.print(
            `context.task.meta.phrases.push(${str(
              `=> ${response.toString()}`
            )});`
          )
          response.toCode(this)
        }
      } finally {
        this.extraArgs = []
      }
    })
  }

  private declareFeatureVariables(phrases: (Response | Action)[]) {
    for (const p of phrases) {
      const feature = p.feature.name
      let f = this.featureVars.get(feature)
      if (!f) {
        f = toId(feature, abbrev, this.featureVars)
        this.tf.print(
          `const ${f} = new ${pascalCase(feature)}Phrases(context);`
        )
      }
    }
  }

  phrase(p: Phrase) {
    const phrasefn = functionName(p)
    if (!this.phraseFns.has(phrasefn)) this.phraseFns.set(phrasefn, p)
    const f = this.featureVars.get(p.feature.name)
    const args = p.args.map((a) => (a as Arg).toCode(this))
    args.push(...this.extraArgs)
    this.tf.print(`await ${f}.${functionName(p)}(${args.join(', ')});`)
  }

  stringLiteral(text: string): string {
    return str(text)
  }

  codeLiteral(src: string): string {
    return src
  }

  private paramName(index: number) {
    return 'xyz'.charAt(index) || `a${index + 1}`
  }

  stringParamDeclaration(index: number): string {
    return `${this.paramName(index)}: string`
  }

  variantParamDeclaration(index: number): string {
    return `${this.paramName(index)}: any`
  }
}

function str(s: string) {
  if (s.includes('\n')) return '\n' + templateStr(s)
  let r = JSON.stringify(s)
  return r
}

function templateStr(s: string) {
  return '`' + s.replace(/([`$\\])/g, '\\$1') + '`'
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function toId(
  s: string,
  transform: (s: string) => string,
  previous: Map<string, string>
) {
  if (previous.has(s)) return previous.get(s)!
  let base = transform(s)
  let id = base
  if ([...previous.values()].includes(id)) {
    let i = 1
    while ([...previous.values()].includes(id + i)) i++
    id = base + i
  }
  previous.set(s, id)
  return id
}

function words(s: string) {
  return s.split(/[^0-9\p{L}]+/gu)
}

function pascalCase(s: string) {
  return words(s).map(capitalize).join('')
}

function underscore(s: string) {
  return words(s).join('_')
}

function abbrev(s: string) {
  return words(s)
    .map((x) => x.charAt(0).toUpperCase())
    .join('')
}

export function functionName(phrase: Phrase) {
  const { kind } = phrase
  return (
    (kind === 'response' ? 'Then_' : 'When_') +
    ([...phrase.content, phrase.docstring ? [phrase.docstring] : []]
      .flatMap((c) =>
        c instanceof Word
          ? words(c.text).filter((x) => x)
          : c instanceof Arg
          ? ['']
          : []
      )
      .join('_') || '')
  )
}