import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  scenarios: {
    frantic_buyers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2s', target: 5000 },
        { duration: '3s', target: 10000 },
        { duration: '2s', target: 0 },
      ],
    },
  },
};

export function setup() {
  const resetRes = http.post('http://localhost:3000/api/reset');
  if (resetRes.status !== 200) {
    console.error('Failed to reset inventory.');
  }
}

// Pre-generate a very small pool of users to simulate impatient users clicking "Buy" multiple times
const IMPATIENT_USERS = Array.from({ length: 500 }, (_, i) => `frantic_user_${i}`);

export default function () {
  // Grab a user from the small pool. 
  // With 10,000 requests and 500 users, each user will effectively send ~20 requests simultaneously.
  const userId = randomItem(IMPATIENT_USERS);
  
  const payload = JSON.stringify({ userId });
  
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post('http://localhost:3000/api/buy', payload, params);

  // We expect 202 (Success), 400 (Sold Out), or 409 (Duplicate)
  check(res, {
    'accepted, sold out, or duplicate': (r) => r.status === 202 || r.status === 400 || r.status === 409,
  });
  
  sleep(0.1);
}
