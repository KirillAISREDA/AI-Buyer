import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { Organization } from '../organizations/organization.entity.js';
import { Role } from '../common/enums/role.enum.js';

const mockOrg = { id: 'org-1', name: 'Test Org' };
const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  password: '',
  firstName: 'Test',
  lastName: 'User',
  role: Role.ADMIN,
  isActive: true,
  organizationId: 'org-1',
  refreshToken: null as string | null,
};

const mockUsersService = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  updateRefreshToken: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

const mockOrgRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    // Hash a known password for login tests
    mockUser.password = await bcrypt.hash('password123', 10);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
    // Re-set password after clearAllMocks
    mockUser.refreshToken = null;
  });

  describe('register', () => {
    it('should register user and return tokens', async () => {
      mockOrgRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.create.mockReturnValue(mockOrg);
      mockOrgRepo.save.mockResolvedValue(mockOrg);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('mock-token');

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('mock-token');
      expect(result.refreshToken).toBe('mock-token');
      expect(mockUsersService.create).toHaveBeenCalled();
    });

    it('should reuse existing organization', async () => {
      mockOrgRepo.findOne.mockResolvedValue(mockOrg);
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('mock-token');

      await service.register({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      });

      expect(mockOrgRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const hashedPw = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, password: hashedPw });
      mockJwtService.signAsync.mockResolvedValue('mock-token');

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.accessToken).toBe('mock-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should throw on wrong email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on wrong password', async () => {
      const hashedPw = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, password: hashedPw });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on deactivated account', async () => {
      const hashedPw = await bcrypt.hash('password123', 10);
      mockUsersService.findByEmail.mockResolvedValue({
        ...mockUser,
        password: hashedPw,
        isActive: false,
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('should clear refresh token', async () => {
      mockUsersService.updateRefreshToken.mockResolvedValue(undefined);
      const result = await service.logout('user-1');
      expect(result.message).toBe('Logged out successfully');
      expect(mockUsersService.updateRefreshToken).toHaveBeenCalledWith('user-1', null);
    });
  });
});
