import { toast } from "sonner";

export const showSuccess = (message: string) => {
  toast.success(message);
};

export const showError = (message: string) => {
  toast.error(message);
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

/** Met à jour en place une notification ouverte par showLoading(). */
export const updateLoading = (toastId: string | number, message: string) => {
  toast.loading(message, { id: toastId });
};

/** Transforme une notification de chargement en succès. */
export const resolveSuccess = (toastId: string | number, message: string) => {
  toast.success(message, { id: toastId });
};

/** Transforme une notification de chargement en erreur. */
export const resolveError = (toastId: string | number, message: string) => {
  toast.error(message, { id: toastId });
};
