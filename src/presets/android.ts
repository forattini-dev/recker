import { ClientOptions } from '../types/index.js';
import { USER_AGENTS } from '../constants/user-agents.js';

export default function android(): ClientOptions {
  return {
    headers: {
      'User-Agent': USER_AGENTS.ANDROID,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA': '"Google Chrome";v="87", "SamsungBrowser";v="14", "Not;A=Brand";v="99"',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"Android"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    }
  };
}
