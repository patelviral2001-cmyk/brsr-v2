import { Test } from '@nestjs/testing';
import { IamService } from './iam.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { KeycloakClient } from '../common/utils/keycloak-client';
import { AuditService } from '../audit/audit.service';

describe('IamService', () => {
  let service: IamService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        IamService,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) } } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: HttpService, useValue: {} },
        { provide: KeycloakClient, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = mod.get(IamService);
  });

  it('returns the current user', async () => {
    const u = await service.me('u1');
    expect(u).toEqual({ id: 'u1' });
  });
});
