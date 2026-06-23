import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** Instagram social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.instagram),
  type: "@alvagante/content-social-instagram",
  version: "2026.06.23.2",
};
