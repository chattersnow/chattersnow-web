-- Retrofits the two Tier 1 items that 20260826070000 seeded with a
-- priority_rationale explicitly deferring their sensitive-topic flag to
-- this issue ("sensitive-topic flag tracked separately in #113").
--
-- Plain UPDATE ... WHERE title IN (...), not a DO block: if the original
-- seed didn't run (e.g. no admin account existed yet in this environment),
-- this simply updates zero rows rather than needing a guard.

update public.calendar_items
set is_sensitive_topic = true,
    tone_guidance = 'Memorial, not sensational. Center trans lives and community grief, not violence details or statistics. Avoid deadnaming/misgendering language in any linked resources. Pair with concrete Chatter action (e.g. mentorship, community meetup) rather than a stand-alone graphic. Requires sensitive-topic reviewer sign-off before any public post.'
where title = 'Transgender Day of Remembrance';

update public.calendar_items
set is_sensitive_topic = true,
    tone_guidance = 'Respectful and factual, not fear-based. Acknowledge both remembrance and present-day HIV/AIDS awareness/prevention -- this is not only a historical retrospective. Avoid stigmatizing language about transmission or status. Requires sensitive-topic reviewer sign-off before any public post.'
where title = 'World AIDS Day';
