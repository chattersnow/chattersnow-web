export type BoardMemberPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type BoardMemberRow = {
  id: string;
  role_title: string;
  term_start: string;
  term_end: string | null;
  is_active: boolean;
  notes: string | null;
  person: BoardMemberPerson;
};
