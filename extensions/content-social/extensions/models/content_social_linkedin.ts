import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** LinkedIn social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.linkedin),
  type: "@alvagante/content-social-linkedin",
  version: "2026.06.23.2",
};
