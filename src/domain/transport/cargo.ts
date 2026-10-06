import { DomainError } from '../shared/domain-error';
import { Volume, Weight } from './value-objects/quantities';

export class Cargo {
  private constructor(
    readonly description: string,
    readonly weight?: Weight,
    readonly volume?: Volume,
  ) {}

  static create(props: { description: string; weight?: Weight; volume?: Volume }): Cargo {
    if (!props.description.trim()) throw new DomainError('Cargo description is required');
    return new Cargo(props.description.trim(), props.weight, props.volume);
  }
}
