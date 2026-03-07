import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { User } from './user.entity.js';
import { Role } from '../common/enums/role.enum.js';

const mockUser: Partial<User> = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  email: 'test@example.com',
  password: '$2b$10$hashedpassword',
  firstName: 'Test',
  lastName: 'User',
  role: Role.UPLOADER,
  isActive: true,
  organizationId: 'org-1',
};

const mockRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  update: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue(mockUser);
      mockRepo.save.mockResolvedValue(mockUser);

      const result = await service.create({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        organizationId: 'org-1',
      });

      expect(result).toEqual(mockUser);
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.create({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
          organizationId: 'org-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should return user by id', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById(mockUser.id!);
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findByEmail('test@example.com');
      expect(result).toEqual(mockUser);
    });

    it('should return null if not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return array of users', async () => {
      mockRepo.find.mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
    });
  });

  describe('remove', () => {
    it('should remove user', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      mockRepo.remove.mockResolvedValue(mockUser);
      await service.remove(mockUser.id!);
      expect(mockRepo.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw if user not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
