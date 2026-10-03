import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2s', target: 5000 },  // Ramp up quickly
        { duration: '3s', target: 10000 }, // Peak at 10,000 VUs
        { duration: '2s', target: 0 },     // Ramp down
      ],
    },
  },
};

export function setup() {
  // Reset inventory before the test starts
  const resetRes = http.post('http://localhost:3000/api/reset');
  if (resetRes.status !== 200) {
    console.error('Failed to reset inventory. Ensure API is running.');
  }
}

export default function () {
  // Generate a random user ID between 1 and 100000
  const userId = `user_${randomIntBetween(1, 100000)}_${__VU}_${__ITER}`;
  
  const payload = JSON.stringify({ userId });
  
  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post('http://localhost:3000/api/buy', payload, params);

  // We expect either 202 (Success) or 400 (Sold Out)
  check(res, {
    'is accepted or sold out': (r) => r.status === 202 || r.status === 400,
  });
  
  // Sleep a tiny bit to simulate realistic burst
  sleep(0.1);
}
