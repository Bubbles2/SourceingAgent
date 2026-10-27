export type Auction = {
  id: string
  title: string
  category: string
  house: string
  city: string
  /** ISO date (YYYY-MM-DD), Paris time */
  saleDate: string
  /** 24-hour time (HH:mm), Paris time */
  saleTime: string
  lotCount: number
  viewing: {
    /** ISO date (YYYY-MM-DD) */
    start: string
    /** ISO date (YYYY-MM-DD) */
    end: string
  }
  /** External PDF published by the auction house */
  catalogueUrl: string
}
