import type { ButtonHTMLAttributes } from "react";

interface GoogleOAuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
}

export function GoogleOAuthButton({ loading = false, disabled, ...rest }: GoogleOAuthButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading}
      aria-label="Continue with Google"
      style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        gap:             12,
        width:           "100%",
        padding:         "10px 16px",
        background:      "#ffffff",
        border:          "1px solid #dadce0",
        borderRadius:    8,
        cursor:          disabled || loading ? "not-allowed" : "pointer",
        fontSize:        14,
        fontWeight:      500,
        color:           "#3c4043",
        fontFamily:      "'Google Sans', Roboto, sans-serif",
        transition:      "box-shadow 0.15s, background 0.15s",
        opacity:         disabled || loading ? 0.6 : 1,
        userSelect:      "none",
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading)
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 1px 3px rgba(60,64,67,.3), 0 4px 8px rgba(60,64,67,.15)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
      }}
      {...rest}
    >
      {/* Official Google "G" SVG per brand guidelines */}
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g>
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
          <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
          <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
        </g>
      </svg>
      <span>{loading ? "Redirecting…" : "Continue with Google"}</span>
    </button>
  );
}
