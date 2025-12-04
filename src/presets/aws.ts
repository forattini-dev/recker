import { ClientOptions } from '../types/index.js';
import { awsSignatureV4Plugin } from '../plugins/auth.js';

export interface AWSPresetOptions {
  /**
   * AWS Access Key ID
   */
  accessKeyId: string;
  /**
   * AWS Secret Access Key
   */
  secretAccessKey: string;
  /**
   * AWS Region (e.g., 'us-east-1')
   */
  region: string;
  /**
   * AWS Service name (e.g., 's3', 'lambda', 'dynamodb')
   */
  service: AWSService | string;
  /**
   * Session token for temporary credentials (optional)
   */
  sessionToken?: string;
  /**
   * Custom endpoint URL (optional, for LocalStack, MinIO, etc.)
   */
  endpoint?: string;
}

export type AWSService =
  | 's3'
  | 'dynamodb'
  | 'lambda'
  | 'sqs'
  | 'sns'
  | 'ses'
  | 'secretsmanager'
  | 'ssm'
  | 'sts'
  | 'iam'
  | 'ec2'
  | 'ecs'
  | 'eks'
  | 'cloudwatch'
  | 'logs'
  | 'events'
  | 'kinesis'
  | 'firehose'
  | 'apigateway'
  | 'execute-api'
  | 'cognito-idp'
  | 'cognito-identity'
  | 'kms'
  | 'athena'
  | 'glue'
  | 'stepfunctions'
  | 'states'
  | 'bedrock'
  | 'bedrock-runtime';

/**
 * Get the default endpoint for an AWS service
 */
function getServiceEndpoint(service: string, region: string): string {
  // Services with global endpoints
  const globalServices = ['iam', 'sts', 'cloudfront', 'route53'];
  if (globalServices.includes(service)) {
    return `https://${service}.amazonaws.com`;
  }

  // Services with special endpoint patterns
  const specialEndpoints: Record<string, string> = {
    's3': `https://s3.${region}.amazonaws.com`,
    'execute-api': `https://${region}.execute-api.amazonaws.com`,
    'logs': `https://logs.${region}.amazonaws.com`,
    'events': `https://events.${region}.amazonaws.com`,
    'states': `https://states.${region}.amazonaws.com`,
    'bedrock-runtime': `https://bedrock-runtime.${region}.amazonaws.com`,
  };

  if (specialEndpoints[service]) {
    return specialEndpoints[service];
  }

  // Default pattern for most services
  return `https://${service}.${region}.amazonaws.com`;
}

/**
 * AWS API preset with Signature V4 authentication
 * @see https://docs.aws.amazon.com/general/latest/gr/signing_aws_api_requests.html
 *
 * @example
 * ```typescript
 * import { aws } from 'recker/presets';
 *
 * // S3
 * const s3 = createClient(aws({
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   region: 'us-east-1',
 *   service: 's3'
 * }));
 *
 * // DynamoDB
 * const dynamodb = createClient(aws({
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   region: 'us-east-1',
 *   service: 'dynamodb'
 * }));
 *
 * // Lambda
 * const lambda = createClient(aws({
 *   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
 *   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
 *   region: 'us-east-1',
 *   service: 'lambda'
 * }));
 * ```
 */
export function aws(options: AWSPresetOptions): ClientOptions {
  const baseUrl = options.endpoint ?? getServiceEndpoint(options.service, options.region);

  return {
    baseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      statusCodes: [408, 429, 500, 502, 503, 504]
    },
    plugins: [
      awsSignatureV4Plugin({
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
        region: options.region,
        service: options.service,
        sessionToken: options.sessionToken,
      })
    ]
  };
}

/**
 * AWS S3 preset (convenience alias)
 */
export function awsS3(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 's3' });
}

/**
 * AWS DynamoDB preset (convenience alias)
 */
export function awsDynamoDB(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'dynamodb' });
}

/**
 * AWS Lambda preset (convenience alias)
 */
export function awsLambda(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'lambda' });
}

/**
 * AWS SQS preset (convenience alias)
 */
export function awsSQS(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'sqs' });
}

/**
 * AWS SNS preset (convenience alias)
 */
export function awsSNS(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'sns' });
}

/**
 * AWS SES preset (convenience alias)
 */
export function awsSES(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'ses' });
}

/**
 * AWS Secrets Manager preset (convenience alias)
 */
export function awsSecretsManager(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'secretsmanager' });
}

/**
 * AWS Bedrock Runtime preset (convenience alias for AI/ML)
 */
export function awsBedrock(options: Omit<AWSPresetOptions, 'service'>): ClientOptions {
  return aws({ ...options, service: 'bedrock-runtime' });
}
