import Svg, { SvgProps, Path } from 'react-native-svg';
const SvgKey2 = (props: SvgProps) => (
  <Svg viewBox="0 0 24 24" fill="none" accessibilityRole="image" {...props}>
    <Path
      d="M15.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
      fill="currentColor"
    />
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M15.5 2a6.5 6.5 0 0 0-6.422 7.508l-5.2 5.2A3 3 0 0 0 3 16.827V19a2 2 0 0 0 2 2h2.172a3 3 0 0 0 2.12-.879l1.415-1.414A1 1 0 0 0 11 18v-1.5h1.5a1 1 0 0 0 .707-.293l1.285-1.285A6.5 6.5 0 1 0 15.5 2ZM11 8.5a4.5 4.5 0 1 1 3.406 4.366 1 1 0 0 0-.95.263l-1.37 1.371H10a1 1 0 0 0-1 1v2.086l-1.121 1.121a1 1 0 0 1-.707.293H5v-2.172a1 1 0 0 1 .293-.707l5.578-5.577a1 1 0 0 0 .263-.95A4.511 4.511 0 0 1 11 8.5Z"
      fill="currentColor"
    />
  </Svg>
);
export default SvgKey2;
