export class AvarToAvak {
  constructor(vrm, options = {}) {
    if (!vrm) throw new Error('AvarToAvak requires a VRM instance');
    this.vrm = vrm;
    this.modelPath = options.modelPath ?? '';
  }

  bake(avar) {
    if (!avar?.tracks?.length) return null;

    return {
      ...avar,
      format: 'avak',
      version: '1.0',
    };
  }
}
