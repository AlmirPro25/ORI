import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function truncateHash(hash: string, length = 8) {
    if (!hash) return '';
    return `${hash.substring(0, length)}...`;
}
