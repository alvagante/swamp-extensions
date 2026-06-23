import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** TikTok social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.tiktok),
  type: "@alvagante/content-social-tiktok",
  version: "2026.06.23.2",
};
