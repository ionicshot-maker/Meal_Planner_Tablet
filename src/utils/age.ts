/**
 * Computes a person's current age in whole years from an ISO date string
 * (YYYY-MM-DD), accounting for whether their birthday has happened yet this
 * calendar year. Returns undefined for an empty/invalid input so callers can
 * fall back to "unknown" rather than showing a wrong number.
 */
export function calculateAge(birthDate: string | undefined): number | undefined {
  if (!birthDate) return undefined
  const dob = new Date(birthDate)
  if (Number.isNaN(dob.getTime())) return undefined

  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate())
  if (!hasHadBirthdayThisYear) age--

  return age >= 0 ? age : undefined
}
