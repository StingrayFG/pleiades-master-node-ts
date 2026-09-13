import type { IdentityConfig } from './identity.config';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

/* contract */

type IdentityModuleDependencies = {
  identityConfig: IdentityConfig;
};

type IdentityModule = {
  repository: IdentityRepository;
  service: IdentityService;
};

/* module */

const createIdentityModule = ({ identityConfig }: IdentityModuleDependencies): IdentityModule => {
  const repository = new IdentityRepository(identityConfig);

  const service = new IdentityService(repository);

  return {
    repository,
    service
  };
};

/* exports */

export { createIdentityModule };
export type { IdentityModule, IdentityModuleDependencies };
