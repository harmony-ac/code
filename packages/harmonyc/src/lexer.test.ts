import { describe, expect, test } from 'vitest'
import { T, lexer } from './lexer'

test('empty', () => {
  expect(lexer.parse('')).toEqual(undefined)
})
test('space', () => {
  expect(lexer.parse('   ')).toEqual(undefined)
})

test('comment', () => {
  expect(lexer.parse('#hello')).toEqual(undefined)
  expect(lexer.parse('// hello')).toEqual(undefined)
  expect(lexer.parse('> hello')).toEqual(undefined)
})

test('response mark', () => {
  expect(lexer.parse('=>')?.kind).toBe(T.ResponseArrow)
})
test('[', () => {
  expect(() => lexer.parse('[')).toThrow()
})

test('text', () => {
  const hello = lexer.parse('hello')
  expect(hello?.kind).toBe(T.PhraseText)
  expect(hello?.text).toBe('hello')
  expect(hello?.next).toBe(undefined)
  const helloWorld = lexer.parse('hello world')
  expect(helloWorld?.kind).toBe(T.PhraseText)
  expect(helloWorld?.text).toBe('hello world')
  expect(helloWorld?.next).toBe(undefined)
})

test('text with space after', () => {
  const hello = lexer.parse('hello ')
  expect(hello?.kind).toBe(T.PhraseText)
  expect(hello?.text).toBe('hello')
  expect(hello?.next).toBe(undefined)
})

test('text with => after', () => {
  const hello = lexer.parse('hello=>')
  expect(hello?.kind).toBe(T.PhraseText)
  expect(hello?.text).toBe('hello')
  expect(hello?.next?.kind).toBe(T.ResponseArrow)
  const withSpace = lexer.parse('hello, world =>')
  expect(withSpace?.kind).toBe(T.PhraseText)
  expect(withSpace?.text).toBe('hello, world')
  expect(withSpace?.next?.kind).toBe(T.ResponseArrow)
})
test('soft break before =>', () => {
  const withSpace = lexer.parse('hello, world \n  =>')
  expect(withSpace?.kind).toBe(T.PhraseText)
  expect(withSpace?.text).toBe('hello, world')
  expect(withSpace?.next?.kind).toBe(T.ResponseArrow)
})

test('newline', () => {
  const two = lexer.parse('hello\nworld')
  expect(two?.text).toBe('hello')
  expect(two?.next?.kind).toBe(T.PhraseText)
  expect(two?.next?.text).toBe('world')
})

describe('seq and fork', () => {
  test('seq', () => {
    const hello = lexer.parse('- hello')
    expect(hello?.kind).toBe(T.Seq)
    expect(hello?.next?.kind).toBe(T.PhraseText)
    expect(hello?.next?.text).toBe('hello')
  })
  test('fork', () => {
    const hello = lexer.parse('+ hello')
    expect(hello?.kind).toBe(T.Fork)
    expect(hello?.next?.kind).toBe(T.PhraseText)
    expect(hello?.next?.text).toBe('hello')
  })
})

describe('dent', () => {
  test('single dent', () => {
    const dent = lexer.parse('  [x ] ')
    expect(dent?.kind).toBe(T.Dent)
    expect(dent?.text).toBe('  ')
    expect(dent?.next?.kind).toBe(T.State)
  })
  test('multiple dent', () => {
    const dent = lexer.parse('    + ')
    expect(dent?.kind).toBe(T.Dent)
    expect(dent?.next?.kind).toBe(T.Dent)
    expect(dent?.next?.next?.kind).toBe(T.Fork)
  })
  test('dent with seq', () => {
    const dent = lexer.parse('  - ')
    expect(dent?.kind).toBe(T.Dent)
    expect(dent?.next?.kind).toBe(T.Seq)
    expect(dent?.next?.next).toBe(undefined)
  })
  test('dent with seq and PhraseText', () => {
    const dent = lexer.parse('  - hi')
    expect(dent?.kind).toBe(T.Dent)
    expect(dent?.next?.kind).toBe(T.Seq)
    expect(dent?.next?.next?.kind).toBe(T.PhraseText)
  })
  test('dent with fork and PhraseText', () => {
    const dent = lexer.parse('  + hi')
    expect(dent?.kind).toBe(T.Dent)
    expect(dent?.next?.kind).toBe(T.Fork)
    expect(dent?.next?.next?.kind).toBe(T.PhraseText)
  })
})

describe('state', () => {
  test('state', () => {
    const state = lexer.parse('[x]')
    expect(state?.kind).toBe(T.State)
    expect(state?.text).toBe('[x]')
  })
  test('state with space', () => {
    const state = lexer.parse('[ x ]')
    expect(state?.kind).toBe(T.State)
    expect(state?.text).toBe('[ x ]')
  })
})

describe('label', () => {
  test('label', () => {
    const label = lexer.parse('hello:')
    expect(label?.kind).toBe(T.Label)
    expect(label?.text).toBe('hello:')
  })
  test('label with space', () => {
    const label = lexer.parse('hello :')
    expect(label?.kind).toBe(T.Label)
    expect(label?.text).toBe('hello :')
  })
  test('label with fork', () => {
    const fork = lexer.parse('+ hello :')
    expect(fork?.kind).toBe(T.Fork)
    expect(fork?.next?.kind).toBe(T.Label)
    const dentFork = lexer.parse('  + hello :')
    expect(dentFork?.kind).toBe(T.Dent)
    expect(dentFork?.next?.kind).toBe(T.Fork)
    expect(dentFork?.next?.next?.kind).toBe(T.Label)
  })
})

describe('double-quote string', () => {
  test('empty', () => {
    const s = lexer.parse('""')
    expect(s?.kind).toBe(T.DoubleQuoteString)
    expect(s?.text).toBe('""')
  })
  test('simple', () => {
    const hello = lexer.parse('"hello"')
    expect(hello?.kind).toBe(T.DoubleQuoteString)
    expect(hello?.text).toBe('"hello"')
  })
})

describe('backtick string', () => {
  test('empty', () => {
    expect(() => lexer.parse('``')).toThrow()
  })
  test('simple', () => {
    const hello = lexer.parse('`hello`')
    expect(hello?.kind).toBe(T.BacktickString)
    expect(hello?.text).toBe('`hello`')
  })
})
