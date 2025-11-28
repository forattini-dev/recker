import { ReckerRequest, ReckerResponse } from '../types/index.js';

export class ReckerError extends Error {
  request?: ReckerRequest;
  response?: ReckerResponse;

  constructor(message: string, request?: ReckerRequest, response?: ReckerResponse) {
    super(message);
    this.name = 'ReckerError';
    this.request = request;
    this.response = response;
  }
}

export class HttpError extends ReckerError {
  status: number;
  statusText: string;

  constructor(response: ReckerResponse, request?: ReckerRequest) {
    super(`Request failed with status code ${response.status} ${response.statusText}`, request, response);
    this.name = 'HttpError';
    this.status = response.status;
    this.statusText = response.statusText;
  }
}

export class TimeoutError extends ReckerError {
  constructor(request?: ReckerRequest) {
    super('Request timed out', request);
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends ReckerError {
  code?: string;

  constructor(message: string, code?: string, request?: ReckerRequest) {
    super(message, request);
    this.name = 'NetworkError';
    this.code = code;
  }
}
