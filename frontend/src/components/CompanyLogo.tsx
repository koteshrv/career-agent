import { useState } from "react";
import { companyInitials, monogramHue } from "@/utils/company";

interface CompanyLogoProps {
  name: string;
  size?: number; // fallback pixel size if w/h classes aren't enough
  className?: string;
  fallbackIcon?: React.ReactNode; // e.g. <Globe /> or <Briefcase /> if we want to show it in the corner
}

export function CompanyLogo({ name, size = 28, className = "", fallbackIcon }: CompanyLogoProps) {
  const [error, setError] = useState(false);

  // Use the backend proxy. Since we have AuthMiddleware that intercepts /api calls,
  // we either need to send the token in the image src (e.g. ?token=...) OR
  // make the logo endpoint public.
  // Wait, let's look at how the backend handles auth for /api/logo.
  // In `backend/routers/logo.py`, it has `Depends(auth.get_current_user)`.
  // So it DOES require authentication.
  // This means a simple `<img src="/api/logo?company=..." />` won't work easily because the browser
  // doesn't send the Authorization header on image tags.
  // Actually, wait, we can just use the token in the query string if the backend supported it,
  // but it doesn't.
  // Let me fix that. The easiest way is to make /api/logo public in main.py, because it's just public favicons!
  // I will add "/api/logo" to PUBLIC_PATHS in main.py.

  const src = `/api/logo?company=${encodeURIComponent(name)}`;
  const initials = companyInitials(name);
  const hue = monogramHue(name);

  return (
    <div 
      className={`relative flex-shrink-0 flex items-center justify-center rounded overflow-hidden ${className}`}
      style={{ 
        width: className.includes('w-') ? undefined : size,
        height: className.includes('h-') ? undefined : size,
        backgroundColor: error ? `hsl(${hue}, 65%, 20%)` : 'transparent',
      }}
      title={name}
    >
      {!error ? (
        <img
          src={src}
          alt={`${name} logo`}
          className="w-full h-full object-contain"
          onError={() => setError(true)}
        />
      ) : (
        <span 
          className="font-bold text-white leading-none select-none"
          style={{ fontSize: (className.includes('w-') ? '0.7em' : size * 0.45) }}
        >
          {initials}
        </span>
      )}
      
      {/* Optional tiny icon overlay (e.g. Globe for crowdsourced) */}
      {fallbackIcon && (
        <div className="absolute -bottom-1 -right-1 w-[50%] h-[50%] bg-background rounded-full flex items-center justify-center shadow-sm border border-border">
          {fallbackIcon}
        </div>
      )}
    </div>
  );
}

