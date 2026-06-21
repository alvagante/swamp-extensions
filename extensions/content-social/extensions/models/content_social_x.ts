import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** X social post generator model. */
export const model: unknown = createSocialModel(PLATFORM_CONFIGS.x);
