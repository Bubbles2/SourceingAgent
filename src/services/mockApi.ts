/** Simulated network delay so loading states are visible while the app runs on mock data. */
export const MOCK_LATENCY_MS = 300

/** Resolves after the simulated delay, for mock calls that act once the "request" arrives. */
export function mockRoundTrip(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, MOCK_LATENCY_MS)
  })
}

export function mockResponse<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(resolve, MOCK_LATENCY_MS, data)
  })
}
