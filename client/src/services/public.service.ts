import type {
  ArtistApplication,
  ArtistApplicationInput,
  ConsultationInput,
  ConsultationRequest,
  SupportTicket,
  SupportTicketInput,
} from '@artinu/shared';
import { api } from '@/lib/api';

export interface SlotAvailability {
  date: string;
  slots: { time: string; available: boolean }[];
  reason?: string;
}

export const publicService = {
  async bookConsultation(input: ConsultationInput) {
    const { data } = await api.post<ConsultationRequest>('/consultations', input);
    return data;
  },

  async slots(date: string) {
    const { data } = await api.get<SlotAvailability>('/consultations/slots', { params: { date } });
    return data;
  },

  async apply(input: ArtistApplicationInput) {
    const { data } = await api.post<ArtistApplication>('/applications', input);
    return data;
  },

  async createTicket(input: SupportTicketInput) {
    const { data } = await api.post<SupportTicket>('/support', input);
    return data;
  },

  async tickets() {
    const { data } = await api.get<SupportTicket[]>('/support');
    return data;
  },
};
