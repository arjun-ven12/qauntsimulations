import bcrypt from 'bcrypt';
export interface PasswordHasher {
  hash(value: string): Promise<string>;
  verify(value: string, hash: string): Promise<boolean>;
}
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds: number) {}
  hash(value: string): Promise<string> {
    return bcrypt.hash(value, this.rounds);
  }
  verify(value: string, hash: string): Promise<boolean> {
    return bcrypt.compare(value, hash);
  }
}
