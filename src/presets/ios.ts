import { ClientOptions } from '../types/index.js';
import { USER_AGENTS } from '../constants/user-agents.js';

export default function ios(): ClientOptions {
  return {
    headers: {
      'User-Agent': USER_AGENTS.IOS,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    }
  };
}
