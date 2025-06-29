import Svg, { SvgProps, Path } from 'react-native-svg';
const SvgShieldExclamation = (props: SvgProps) => (
  <Svg viewBox="0 0 24 24" accessibilityRole="image" {...props}>
    <Path
      fill="currentColor"
      fillRule="evenodd"
      d="M12.975 2.278a3 3 0 0 0-1.95 0l-6 2.063A3 3 0 0 0 3 7.178v4.735c0 2.806 1.149 4.83 2.813 6.404 1.572 1.489 3.632 2.6 5.555 3.637l.157.084a1 1 0 0 0 .95 0l.157-.084c1.923-1.037 3.983-2.148 5.556-3.637C19.85 16.742 21 14.72 21 11.913V7.178a3 3 0 0 0-2.025-2.837l-6-2.063ZM12 7.5a1 1 0 0 1 1 1v2a1 1 0 1 1-2 0v-2a1 1 0 0 1 1-1Zm-1.25 6a1.25 1.25 0 1 1 2.5 0 1.25 1.25 0 0 1-2.5 0Z"
      clipRule="evenodd"
    />
  </Svg>
);
export default SvgShieldExclamation;
