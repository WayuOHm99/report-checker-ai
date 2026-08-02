/**
 * Wire contract shared by the Cloudflare Worker and the browser bundle.
 *
 * `API_VERSION` is a constant that must be bumped whenever the shape of
 * `/api/analyze` or `/api/health` changes in a way an older client cannot read.
 * The Worker stamps it on v1 responses; intentionally unstamped v0 responses
 * preserve the exact pre-version shape for the legacy Pages bundle. The
 * browser refuses an explicitly stamped version it does not understand.
 */
export const API_VERSION = 1

/** Explicit opt-in used by the new Pages bundle during a rolling deployment. */
export const API_VERSION_HEADER = 'X-RubricLensAi-Api-Version'

/** Accepted temporarily so an already-open tab from the previous public name can finish its request. */
export const LEGACY_API_VERSION_HEADER = 'X-RubricLens-Api-Version'

/** Versions this build of the browser bundle can render without losing information. */
export const SUPPORTED_API_VERSIONS: readonly number[] = [API_VERSION]

/**
 * Responses produced before `apiVersion` existed. They carry no applicability
 * information, so the client upgrades them explicitly rather than guessing.
 */
export const LEGACY_API_VERSION = 0

/** Versions the compatibility Worker can serve during the rollout window. */
export const SUPPORTED_REQUEST_API_VERSIONS = [LEGACY_API_VERSION, API_VERSION] as const

export type RequestApiVersion = (typeof SUPPORTED_REQUEST_API_VERSIONS)[number]

export function isSupportedRequestApiVersion(version: number): version is RequestApiVersion {
  return (SUPPORTED_REQUEST_API_VERSIONS as readonly number[]).includes(version)
}

export const SECTION_APPLICABILITY = ['applicable', 'not_applicable'] as const

export type SectionApplicability = (typeof SECTION_APPLICABILITY)[number]

export const DEFAULT_APPLICABILITY: SectionApplicability = 'applicable'

export function isSupportedApiVersion(version: number): boolean {
  return SUPPORTED_API_VERSIONS.includes(version)
}
