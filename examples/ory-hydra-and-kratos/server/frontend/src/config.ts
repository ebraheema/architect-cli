export default {
  site: {
    name: process.env.SITE_NAME || 'SecureApp'
  },
  kratos: {
    browserPrefix: '/.kratos',
    admin: (process.env.KRATOS_ADMIN_URL || '').replace(/\/+$/, ''),
    public: (process.env.KRATOS_PUBLIC_URL || '').replace(/\/+$/, '')
  },
  hydra: {
    admin: (process.env.HYDRA_ADMIN_URL || '').replace(/\/+$/, ''),
    public: (process.env.HYDRA_PUBLIC_URL || '').replace(/\/+$/, '')
  }
};
