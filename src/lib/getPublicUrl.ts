export const getPublicBaseUrl = () =>
  import.meta.env.VITE_PUBLIC_URL || window.location.origin;
