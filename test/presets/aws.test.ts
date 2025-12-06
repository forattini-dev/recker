import { describe, it, expect } from 'vitest';
import {
  aws,
  awsS3,
  awsDynamoDB,
  awsLambda,
  awsSQS,
  awsSNS,
  awsSES,
  awsSecretsManager,
  awsBedrock,
} from '../../src/presets/aws.js';

describe('AWS Presets', () => {
  const baseOptions = {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
  };

  describe('aws', () => {
    it('should create S3 preset with correct endpoint', () => {
      const config = aws({ ...baseOptions, service: 's3' });
      expect(config.baseUrl).toBe('https://s3.us-east-1.amazonaws.com');
      expect(config.headers).toHaveProperty('Content-Type', 'application/json');
      expect(config.timeout).toBe(30000);
      expect(config.retry?.maxAttempts).toBe(3);
      expect(config.plugins).toHaveLength(1);
    });

    it('should create DynamoDB preset with correct endpoint', () => {
      const config = aws({ ...baseOptions, service: 'dynamodb' });
      expect(config.baseUrl).toBe('https://dynamodb.us-east-1.amazonaws.com');
    });

    it('should create Lambda preset with correct endpoint', () => {
      const config = aws({ ...baseOptions, service: 'lambda' });
      expect(config.baseUrl).toBe('https://lambda.us-east-1.amazonaws.com');
    });

    it('should create SQS preset with correct endpoint', () => {
      const config = aws({ ...baseOptions, service: 'sqs' });
      expect(config.baseUrl).toBe('https://sqs.us-east-1.amazonaws.com');
    });

    it('should create SNS preset with correct endpoint', () => {
      const config = aws({ ...baseOptions, service: 'sns' });
      expect(config.baseUrl).toBe('https://sns.us-east-1.amazonaws.com');
    });

    it('should handle global services (IAM)', () => {
      const config = aws({ ...baseOptions, service: 'iam' });
      expect(config.baseUrl).toBe('https://iam.amazonaws.com');
    });

    it('should handle global services (STS)', () => {
      const config = aws({ ...baseOptions, service: 'sts' });
      expect(config.baseUrl).toBe('https://sts.amazonaws.com');
    });

    it('should handle execute-api with special endpoint', () => {
      const config = aws({ ...baseOptions, service: 'execute-api' });
      expect(config.baseUrl).toBe('https://us-east-1.execute-api.amazonaws.com');
    });

    it('should handle logs with special endpoint', () => {
      const config = aws({ ...baseOptions, service: 'logs' });
      expect(config.baseUrl).toBe('https://logs.us-east-1.amazonaws.com');
    });

    it('should handle events with special endpoint', () => {
      const config = aws({ ...baseOptions, service: 'events' });
      expect(config.baseUrl).toBe('https://events.us-east-1.amazonaws.com');
    });

    it('should handle states (Step Functions) with special endpoint', () => {
      const config = aws({ ...baseOptions, service: 'states' });
      expect(config.baseUrl).toBe('https://states.us-east-1.amazonaws.com');
    });

    it('should handle bedrock-runtime with special endpoint', () => {
      const config = aws({ ...baseOptions, service: 'bedrock-runtime' });
      expect(config.baseUrl).toBe('https://bedrock-runtime.us-east-1.amazonaws.com');
    });

    it('should use custom endpoint when provided', () => {
      const config = aws({
        ...baseOptions,
        service: 's3',
        endpoint: 'http://localhost:4566'
      });
      expect(config.baseUrl).toBe('http://localhost:4566');
    });

    it('should include session token when provided', () => {
      const config = aws({
        ...baseOptions,
        service: 's3',
        sessionToken: 'SESSION_TOKEN_EXAMPLE'
      });
      expect(config.plugins).toHaveLength(1);
    });

    it('should configure retry with exponential backoff', () => {
      const config = aws({ ...baseOptions, service: 's3' });
      expect(config.retry?.backoff).toBe('exponential');
      expect(config.retry?.delay).toBe(1000);
      expect(config.retry?.statusCodes).toContain(429);
      expect(config.retry?.statusCodes).toContain(503);
    });

    it('should work with different regions', () => {
      const config = aws({
        ...baseOptions,
        region: 'eu-west-1',
        service: 's3'
      });
      expect(config.baseUrl).toBe('https://s3.eu-west-1.amazonaws.com');
    });

    it('should work with ap-southeast region', () => {
      const config = aws({
        ...baseOptions,
        region: 'ap-southeast-1',
        service: 'dynamodb'
      });
      expect(config.baseUrl).toBe('https://dynamodb.ap-southeast-1.amazonaws.com');
    });
  });

  describe('awsS3', () => {
    it('should create S3 preset', () => {
      const config = awsS3(baseOptions);
      expect(config.baseUrl).toBe('https://s3.us-east-1.amazonaws.com');
    });

    it('should pass through all options', () => {
      const config = awsS3({
        ...baseOptions,
        sessionToken: 'token',
        endpoint: 'http://minio:9000'
      });
      expect(config.baseUrl).toBe('http://minio:9000');
    });
  });

  describe('awsDynamoDB', () => {
    it('should create DynamoDB preset', () => {
      const config = awsDynamoDB(baseOptions);
      expect(config.baseUrl).toBe('https://dynamodb.us-east-1.amazonaws.com');
    });
  });

  describe('awsLambda', () => {
    it('should create Lambda preset', () => {
      const config = awsLambda(baseOptions);
      expect(config.baseUrl).toBe('https://lambda.us-east-1.amazonaws.com');
    });
  });

  describe('awsSQS', () => {
    it('should create SQS preset', () => {
      const config = awsSQS(baseOptions);
      expect(config.baseUrl).toBe('https://sqs.us-east-1.amazonaws.com');
    });
  });

  describe('awsSNS', () => {
    it('should create SNS preset', () => {
      const config = awsSNS(baseOptions);
      expect(config.baseUrl).toBe('https://sns.us-east-1.amazonaws.com');
    });
  });

  describe('awsSES', () => {
    it('should create SES preset', () => {
      const config = awsSES(baseOptions);
      expect(config.baseUrl).toBe('https://ses.us-east-1.amazonaws.com');
    });
  });

  describe('awsSecretsManager', () => {
    it('should create Secrets Manager preset', () => {
      const config = awsSecretsManager(baseOptions);
      expect(config.baseUrl).toBe('https://secretsmanager.us-east-1.amazonaws.com');
    });
  });

  describe('awsBedrock', () => {
    it('should create Bedrock preset', () => {
      const config = awsBedrock(baseOptions);
      expect(config.baseUrl).toBe('https://bedrock-runtime.us-east-1.amazonaws.com');
    });

    it('should work with different regions for Bedrock', () => {
      const config = awsBedrock({
        ...baseOptions,
        region: 'us-west-2'
      });
      expect(config.baseUrl).toBe('https://bedrock-runtime.us-west-2.amazonaws.com');
    });
  });

  describe('edge cases', () => {
    it('should handle unknown service with default pattern', () => {
      const config = aws({
        ...baseOptions,
        service: 'custom-service' as any
      });
      expect(config.baseUrl).toBe('https://custom-service.us-east-1.amazonaws.com');
    });

    it('should preserve all configuration properties', () => {
      const config = aws({ ...baseOptions, service: 's3' });

      // Check all expected properties exist
      expect(config).toHaveProperty('baseUrl');
      expect(config).toHaveProperty('headers');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('retry');
      expect(config).toHaveProperty('plugins');
    });
  });
});
