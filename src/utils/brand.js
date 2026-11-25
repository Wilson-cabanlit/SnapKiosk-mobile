const DEFAULT_BRAND = Object.freeze({
  businessName: 'SnapKiosk',
  eventName: '',
  welcomeMessage: 'Make a little memory.',
  instruction: 'Gather your people, find your light, and let’s make something worth keeping.',
  thankYouMessage: 'Thanks for making a memory with us.',
  logoUri: '',
  colors: {
    cream: '#F6F0E6',
    ink: '#26241F',
    muted: '#77736A',
    coral: '#E8A18C',
    lavender: '#C9C1E5',
    sage: '#BCCDBA',
    card: '#FFFCF7',
    border: '#E8E0D4',
  },
});

function normalizeBrand(input = {}) {
  const incomingColors = input.colors || {};
  const colors = {...DEFAULT_BRAND.colors};
  Object.keys(colors).forEach(key => {
    const candidate = incomingColors[key];
    if (typeof candidate === 'string' && /^#[\da-f]{6}$/i.test(candidate)) colors[key] = candidate;
  });
  return {
    ...DEFAULT_BRAND,
    ...input,
    logoUri: typeof input.logoUri === 'string' ? input.logoUri.trim() : DEFAULT_BRAND.logoUri,
    colors,
  };
}

module.exports = {DEFAULT_BRAND, normalizeBrand};
