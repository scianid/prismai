// Jest setup file
require('@testing-library/jest-dom');

// Mock localStorage with a real store
const createStorage = () => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
};

const localStorageMock = createStorage();
global.localStorage = localStorageMock;

// Mock sessionStorage with a real store
const sessionStorageMock = createStorage();
global.sessionStorage = sessionStorageMock;

// Mock fetch
global.fetch = jest.fn();

// Mock crypto.randomUUID
if (!global.crypto) {
  global.crypto = {};
}
global.crypto.randomUUID = jest.fn(() => 'test-uuid-1234-5678-90ab-cdef');

// Add ReadableStream polyfill for streaming tests
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = class ReadableStream {
    constructor(underlyingSource) {
      this.underlyingSource = underlyingSource;
      this._started = false;
    }
    getReader() {
      const source = this.underlyingSource;
      const chunks = [];
      
      if (source && source.start && !this._started) {
        this._started = true;
        const controller = {
          enqueue: (chunk) => chunks.push(chunk),
          close: () => {},
          error: (err) => {}
        };
        source.start(controller);
      }
      
      let index = 0;
      return {
        read: jest.fn(() => {
          if (index < chunks.length) {
            return Promise.resolve({ done: false, value: chunks[index++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        }),
        releaseLock: jest.fn()
      };
    }
  };
}

// Add TextEncoder if not available
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      return new Uint8Array(Buffer.from(str, 'utf-8'));
    }
  };
}

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  
  sessionStorageMock.getItem.mockClear();
  sessionStorageMock.setItem.mockClear();
  sessionStorageMock.removeItem.mockClear();
  sessionStorageMock.clear.mockClear();
  
  fetch.mockClear();
});
