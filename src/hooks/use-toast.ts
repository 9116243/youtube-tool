type ToastVariant = "default" | "destructive";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
}

export function useToast(): ToastApi {
  return {
    toast: ({ title, description, variant = "default" }) => {
      const message = description ? `${title}: ${description}` : title;
      if (variant === "destructive") {
        console.error(`[toast] ${message}`);
      } else {
        console.log(`[toast] ${message}`);
      }
    },
  };
}

export default useToast;

