/** Simulated network delay so loading states are visible while the app runs on mock data. */
export const MOCK_LATENCY_MS = 300

export function mockResponse<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(resolve, MOCK_LATENCY_MS, data)
  })
}
