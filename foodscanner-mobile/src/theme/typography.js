import { Platform } from 'react-native';

export const typography = {
  sans: Platform.select({ ios: 'System', android: 'Roboto', default: 'sans-serif' }),
  serif: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  fraunces: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  inter: Platform.select({ ios: 'System', android: 'Roboto', default: 'sans-serif' }),
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hero: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
};
