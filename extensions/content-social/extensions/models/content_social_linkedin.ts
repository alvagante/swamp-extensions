import {
  createSocialModel,
  PLATFORM_CONFIGS,
} from "./content_social_common.ts";

/** LinkedIn social post generator model. */
export const model = {
  ...createSocialModel(PLATFORM_CONFIGS.linkedin),
  type: "@alvagante/content-social-linkedin",
  version: "2026.08.02.1",
  upgrades: [
    {
      toVersion: "2026.08.02.1",
      description: "Add douglasadams persona preset",
      upgradeAttributes: (old: Record<string, unknown>) => old,
    },
  ],
};
