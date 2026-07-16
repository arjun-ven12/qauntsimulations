import { memo } from 'react';

export const AuthAtmosphere = memo(function AuthAtmosphere() {
  return (
    <div className="auth-atmosphere" aria-hidden="true">
      <svg
        className="auth-atmosphere__ribbon"
        focusable="false"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 1000"
      >
        <defs>
          <linearGradient id="aurora-body" x1="0.12" x2="0.9" y1="0.82" y2="0.18">
            <stop offset="0" stopColor="#07070a" stopOpacity="0" />
            <stop offset="0.18" stopColor="#5950a8" stopOpacity="0.54" />
            <stop offset="0.48" stopColor="#364f9a" stopOpacity="0.66" />
            <stop offset="0.74" stopColor="#3f8ed0" stopOpacity="0.38" />
            <stop offset="1" stopColor="#07070a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aurora-depth" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0.08" stopColor="#07070a" stopOpacity="0" />
            <stop offset="0.34" stopColor="#5950a8" stopOpacity="0.28" />
            <stop offset="0.58" stopColor="#96c8ad" stopOpacity="0.24" />
            <stop offset="0.82" stopColor="#d9d9d1" stopOpacity="0.12" />
            <stop offset="1" stopColor="#07070a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aurora-edge" x1="0" x2="1" y1="0.85" y2="0.15">
            <stop offset="0" stopColor="#3f8ed0" stopOpacity="0" />
            <stop offset="0.28" stopColor="#3f8ed0" stopOpacity="0.3" />
            <stop offset="0.55" stopColor="#79d4dc" stopOpacity="0.62" />
            <stop offset="0.72" stopColor="#96c8ad" stopOpacity="0.34" />
            <stop offset="1" stopColor="#d9d9d1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aurora-reflection" x1="0" x2="1" y1="0.6" y2="0.35">
            <stop offset="0" stopColor="#c97963" stopOpacity="0" />
            <stop offset="0.45" stopColor="#c97963" stopOpacity="0.38" />
            <stop offset="0.68" stopColor="#d5a164" stopOpacity="0.24" />
            <stop offset="1" stopColor="#d9d9d1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="aurora-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="black" />
            <stop offset="0.1" stopColor="white" />
            <stop offset="0.76" stopColor="white" />
            <stop offset="0.96" stopColor="black" />
          </linearGradient>
          <mask id="aurora-taper">
            <rect width="1600" height="1000" fill="url(#aurora-fade)" />
          </mask>
          <filter id="aurora-body-soft" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="46" />
          </filter>
          <filter id="aurora-edge-soft" x="-30%" y="-40%" width="160%" height="180%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <g mask="url(#aurora-taper)">
          <g className="auth-aurora__primary">
            <path
              className="auth-aurora__body"
              d="M-170 930 C30 804 158 742 328 626 C487 518 548 403 724 358 C906 312 1018 394 1174 332 C1302 281 1354 177 1538 116 L1608 300 C1424 344 1361 443 1205 489 C1036 539 916 466 754 519 C591 572 530 694 358 782 C184 872 28 934 -166 1040 Z"
            />
            <path
              className="auth-aurora__depth"
              d="M-118 874 C68 766 204 694 359 598 C516 500 583 426 735 395 C892 363 1007 430 1156 382 C1260 348 1334 278 1466 234 C1336 337 1280 438 1150 474 C1003 515 894 450 748 493 C592 540 525 649 357 730 C203 805 64 861 -118 956 Z"
            />
            <path
              className="auth-aurora__hollow"
              d="M-64 904 C107 812 244 744 384 656 C527 566 596 486 738 459 C873 433 980 481 1112 447 C947 542 850 528 742 562 C598 608 520 694 376 766 C230 839 104 887 -64 970 Z"
            />
          </g>
          <g className="auth-aurora__refraction">
            <path
              className="auth-aurora__edge"
              d="M-156 1004 C46 890 187 832 350 744 C518 654 588 535 748 492 C905 449 1018 515 1184 464 C1332 419 1398 324 1550 286 C1408 370 1350 482 1190 530 C1026 579 910 518 758 562 C601 608 530 723 362 808 C197 891 50 950 -156 1060 Z"
            />
            <path
              className="auth-aurora__pearl"
              d="M108 724 C270 634 397 548 532 455 C662 366 779 331 920 350 C1009 362 1078 355 1163 317 C1058 405 972 423 891 414 C757 398 665 432 544 514 C412 604 288 681 108 770 Z"
            />
          </g>
          <g className="auth-aurora__reflection">
            <path
              className="auth-aurora__warm"
              d="M742 382 C878 326 982 352 1093 315 C1170 289 1235 241 1311 190 C1250 273 1194 342 1104 376 C987 421 881 391 742 432 Z"
            />
          </g>
        </g>
      </svg>
      <i className="auth-atmosphere__grain" />
    </div>
  );
});
