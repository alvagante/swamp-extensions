import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** Facebook social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.facebook),
  type: "@alvagante/content-social-facebook",
  version: "2026.06.23.2",
};
