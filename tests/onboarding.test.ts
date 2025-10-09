import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBeneficiaryRecord } from '../src/utils/beneficiary';
import { formatCpf, isValidCpf, isValidPassword, isValidEmail } from '../src/utils/format';

test('normalizeBeneficiaryRecord maps Rapidoc payload to internal fields', () => {
  const raw = {
    uuid: '12345-uuid',
    cpf: '123.456.789-09',
    name: 'Maria da Silva',
    birthDate: '1990-02-17T00:00:00Z',
    phoneNumber: '(11) 91234-5678',
    email: 'maria@example.com',
    city: 'São Paulo',
    state: 'SP',
    plans: [{ plan: { name: 'Premium' } }],
  };

  const normalized = normalizeBeneficiaryRecord(raw, '');

  assert.equal(normalized.uuid, '12345-uuid');
  assert.equal(normalized.cpf, '12345678909');
  assert.equal(normalized.name, 'Maria da Silva');
  assert.equal(normalized.birthday, '1990-02-17');
  assert.equal(normalized.phone, '(11) 91234-5678');
  assert.equal(normalized.email, 'maria@example.com');
  assert.equal(normalized.city, 'São Paulo');
  assert.equal(normalized.state, 'SP');
  assert.ok(Array.isArray(normalized.plans));
  assert.ok(isValidCpf(normalized.cpf));
  assert.equal(formatCpf(normalized.cpf), '123.456.789-09');
});

test('normalizeBeneficiaryRecord falls back to digits and generates uuid when absent', () => {
  const raw = {
    document: '98765432100',
    fullName: 'João Pereira',
    birthday: '19850103',
    code: '001',
  };

  const normalized = normalizeBeneficiaryRecord(raw, '98765432100');
  assert.equal(normalized.cpf, '98765432100');
  assert.equal(normalized.name, 'João Pereira');
  assert.equal(normalized.birthday, '1985-01-03');
  assert.equal(normalized.uuid, '001');
});

test('normalizeBeneficiaryRecord unwraps nested beneficiary payload', () => {
  const raw = {
    success: true,
    beneficiary: {
      uuid: 'af6bbd20',
      cpf: '16863409747',
      name: 'Jeniffer Dias',
      birthday: '13/05/1998',
      phone: '21970941888',
      email: 'jdias@example.com',
      zipCode: '26255155',
      address: 'Av. Principal, 100',
      city: 'Nova Iguaçu',
      state: 'RJ',
      paymentType: 'S',
      serviceType: 'GSP',
      isActive: true,
      dependents: [{ uuid: 'dep-1' }],
    },
    message: 'Processamento concluido com sucesso.',
  };

  const normalized = normalizeBeneficiaryRecord(raw, '16863409747');
  assert.equal(normalized.uuid, 'af6bbd20');
  assert.equal(normalized.cpf, '16863409747');
  assert.equal(normalized.name, 'Jeniffer Dias');
  assert.equal(normalized.zipCode, '26255155');
  assert.equal(normalized.address, 'Av. Principal, 100');
  assert.equal(normalized.paymentType, 'S');
  assert.equal(normalized.serviceType, 'GSP');
  assert.equal(normalized.isActive, true);
  assert.ok(Array.isArray(normalized.dependents));
  assert.ok(normalized.raw);
});

test('password validation enforces minimum length used in onboarding and admin flows', () => {
  assert.equal(isValidPassword('12345'), false);
  assert.equal(isValidPassword('123456'), true);
  assert.equal(isValidPassword(' senhaSecreta '), true);
  assert.equal(isValidEmail('admin@telemedicina.plus'), true);
  assert.equal(isValidEmail('email-invalido'), false);
});
