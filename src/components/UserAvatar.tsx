import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/hooks/useProfile';

interface UserAvatarProps {
  avatarUrl: string | null | undefined;
  fullName: string | null | undefined;
  email: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
};

export const UserAvatar = ({ avatarUrl, fullName, email, size = 'sm', className = '' }: UserAvatarProps) => {
  const initials = getInitials(fullName, email);

  return (
    <Avatar className={`${sizeClasses[size]} ${className}`}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName || 'User'} />}
      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
};
