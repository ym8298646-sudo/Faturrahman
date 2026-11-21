import {
  Briefcase,
  Car,
  Coffee,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  PiggyBank,
  Receipt,
  ShoppingBag,
  Smartphone,
  Tag,
  TrendingUp,
  Utensils,
  Wallet,
} from 'lucide-react';

interface CategoryIconProps {
  icon: string;
  className?: string;
}

export function CategoryIcon({ icon, className = 'w-4 h-4' }: CategoryIconProps) {
  switch (icon) {
    case 'utensils':
      return <Utensils className={className} />;
    case 'coffee':
      return <Coffee className={className} />;
    case 'car':
      return <Car className={className} />;
    case 'shopping-bag':
      return <ShoppingBag className={className} />;
    case 'receipt':
      return <Receipt className={className} />;
    case 'home':
      return <Home className={className} />;
    case 'heart-pulse':
      return <HeartPulse className={className} />;
    case 'graduation-cap':
      return <GraduationCap className={className} />;
    case 'film':
      return <Film className={className} />;
    case 'smartphone':
      return <Smartphone className={className} />;
    case 'briefcase':
      return <Briefcase className={className} />;
    case 'trending-up':
      return <TrendingUp className={className} />;
    case 'gift':
      return <Gift className={className} />;
    case 'wallet':
      return <Wallet className={className} />;
    case 'landmark':
      return <Landmark className={className} />;
    case 'piggy-bank':
      return <PiggyBank className={className} />;
    default:
      return <Tag className={className} />;
  }
}
