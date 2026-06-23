import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** X social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.x),
  type: "@alvagante/content-social-x",
  version: "2026.06.23.2",
};
