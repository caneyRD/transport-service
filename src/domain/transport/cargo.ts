import { DomainError } from '../shared/domain-error';
import { Volume, Weight } from './value-objects/quantities';

export enum CargoType {
  MATERIALS = 'MATERIALS',
  AGGREGATES = 'AGGREGATES',
  MACHINERY = 'MACHINERY',
  OTHER = 'OTHER',
}

export class Cargo {
  private constructor(
    readonly description: string,
    readonly weight?: Weight,
    readonly volume?: Volume,
    private type?: CargoType,
  ) {}

  static create(props: { description: string; weight?: Weight; volume?: Volume }): Cargo {
    if (!props.description.trim()) throw new DomainError('Cargo description is required');
    return new Cargo(props.description.trim(), props.weight, props.volume);
  }

  get cargoType(): CargoType | undefined { return this.type; }

  selectType(type: CargoType): void {
    this.type = type;
  }
}
