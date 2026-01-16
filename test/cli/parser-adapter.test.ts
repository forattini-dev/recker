import { describe, it, expect } from 'vitest'
import { parseRekArgs } from '../../src/cli/schema.js'
import { RekArgsAdapter, parseArgsLegacy } from '../../src/cli/parser-adapter.js'

describe('parseRekArgs (new API)', () => {
  describe('HTTPie-style syntax', () => {
    it('should parse data parameters (key=value)', () => {
      const result = parseRekArgs(['name=Filipe', 'city=Berlin'])
      expect(result.data).toEqual({ name: 'Filipe', city: 'Berlin' })
    })

    it('should parse typed data parameters (key:=value)', () => {
      const result = parseRekArgs(['age:=35', 'active:=true', 'score:=null'])
      expect(result.data).toEqual({ age: 35, active: true, score: null })
    })

    it('should parse headers (Key:Value)', () => {
      const result = parseRekArgs([
        'Authorization:Bearer token123',
        'Content-Type:application/json'
      ])
      expect(result.headers).toEqual({
        Authorization: 'Bearer token123',
        'Content-Type': 'application/json'
      })
    })

    it('should parse presets (+name)', () => {
      const result = parseRekArgs(['+openai', '+github'])
      expect(result.presets).toEqual({ openai: true, github: true })
    })

    it('should parse flags (--flag, -f)', () => {
      const result = parseRekArgs(['--verbose', '-q'])
      expect(result.flags).toEqual({ verbose: true, q: true })
    })

    it('should parse options (--opt=val, -o val)', () => {
      const result = parseRekArgs(['--output=file.json', '-p', '3000'])
      expect(result.options.output).toBe('file.json')
      // cli-args-parser coerces numeric strings to numbers
      expect(result.options.p).toBe(3000)
    })

    it('should collect positional arguments', () => {
      const result = parseRekArgs(['https://api.example.com', '/users'])
      expect(result.positional).toEqual(['https://api.example.com', '/users'])
    })
  })

  describe('complex examples', () => {
    it('should handle typical HTTP request', () => {
      const result = parseRekArgs([
        'https://api.example.com/users',
        'name=John',
        'age:=30',
        'Authorization:Bearer abc123',
        '+openai',
        '--verbose',
        '-o', 'output.json'
      ])

      expect(result.positional).toEqual(['https://api.example.com/users'])
      expect(result.data).toEqual({ name: 'John', age: 30 })
      expect(result.headers).toEqual({ Authorization: 'Bearer abc123' })
      expect(result.presets).toEqual({ openai: true })
      expect(result.flags.verbose).toBe(true)
      expect(result.options.o).toBe('output.json')
    })

    it('should not confuse URLs with headers', () => {
      const result = parseRekArgs([
        'https://api.example.com',
        'http://localhost:3000',
        'ws://socket.io',
        'ftp://files.example.com'
      ])

      expect(result.positional).toContain('https://api.example.com')
      expect(result.positional).toContain('http://localhost:3000')
      expect(result.positional).toContain('ws://socket.io')
      expect(result.positional).toContain('ftp://files.example.com')
      expect(result.headers).toEqual({})
    })

    it('should handle values with special characters', () => {
      const result = parseRekArgs([
        'query=SELECT * FROM users WHERE id=1',
        'url=https://example.com?foo=bar&baz=qux'
      ])

      expect(result.data.query).toBe('SELECT * FROM users WHERE id=1')
      expect(result.data.url).toBe('https://example.com?foo=bar&baz=qux')
    })

    it('should handle JSON arrays with :=', () => {
      const result = parseRekArgs(['tags:=["a","b","c"]', 'nums:=[1,2,3]'])
      expect(result.data.tags).toEqual(['a', 'b', 'c'])
      expect(result.data.nums).toEqual([1, 2, 3])
    })
  })
})

describe('RekArgsAdapter (legacy compatibility)', () => {
  it('should return legacy format with args instead of positional', () => {
    const result = RekArgsAdapter.parse(['https://api.com', 'name=Test'])

    expect(result.args).toEqual(['https://api.com'])
    expect(result.data).toEqual({ name: 'Test' })
    expect(result.headers).toEqual({})
    expect(result.options).toEqual({})
    expect(result.presets).toEqual([])
    expect(result.errors).toEqual([])
  })

  it('should convert presets object to array', () => {
    const result = RekArgsAdapter.parse(['+openai', '+github'])
    expect(result.presets).toEqual(['openai', 'github'])
  })

  it('should merge flags into options', () => {
    const result = RekArgsAdapter.parse(['--verbose', '-q'])
    expect(result.options.verbose).toBe(true)
    expect(result.options.q).toBe(true)
  })

  it('should apply schema defaults', () => {
    const result = RekArgsAdapter.parse(['https://api.com'], {
      name: 'test',
      description: 'Test command',
      params: {
        limit: { type: 'number', description: 'Limit', default: 10 }
      },
      flags: {
        verbose: { description: 'Verbose output', default: false }
      }
    })

    expect(result.data.limit).toBe(10)
    expect(result.options.verbose).toBe(false)
  })

  it('should validate required params', () => {
    const result = RekArgsAdapter.parse(['https://api.com'], {
      name: 'test',
      description: 'Test command',
      params: {
        apiKey: { type: 'string', description: 'API Key', required: true }
      }
    })

    expect(result.errors).toContain('Missing required parameter: apiKey=value')
  })

  it('should validate choices', () => {
    const result = RekArgsAdapter.parse(['format=xml'], {
      name: 'test',
      description: 'Test command',
      params: {
        format: {
          type: 'string',
          description: 'Output format',
          choices: ['json', 'csv', 'table']
        }
      }
    })

    expect(result.errors.some(e => e.includes('Invalid value'))).toBe(true)
  })

  it('should process keywords', () => {
    const result = RekArgsAdapter.parse(['https://api.com', 'silent'], {
      name: 'test',
      description: 'Test command',
      keywords: {
        silent: { description: 'Suppress output', mapTo: 'quiet' }
      }
    })

    expect(result.data.quiet).toBe(true)
  })
})

describe('parseArgsLegacy function', () => {
  it('should work the same as RekArgsAdapter.parse', () => {
    const input = ['https://api.com', 'name=Test', '--verbose', '+openai']
    const adapterResult = RekArgsAdapter.parse(input)
    const functionResult = parseArgsLegacy(input)

    expect(functionResult).toEqual(adapterResult)
  })
})
