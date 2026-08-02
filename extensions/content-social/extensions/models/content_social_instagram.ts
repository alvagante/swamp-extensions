import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** Instagram social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.instagram),
  type: "@alvagante/content-social-instagram",
  version: "2026.08.02.1",
  upgrades: [
    {
      toVersion: "2026.08.02.1",
      description: "Add douglasadams persona preset",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
};
