-- ============================================================================
-- CSP Goals + Measures Seed
-- ============================================================================
-- Seeds the full CSP hierarchy under each of the 6 strategic priorities.
-- Source: 2026-Citywide-Strategic-Plan.pdf, pages 8–34.
-- Companion to 20260507000006_lens_architecture_schema.sql.
--
-- 23 goals (CH=5, EW=3, HG=4, HH=3, MC=5, PS=3)
-- 47 measures, each with an initial target string and (where parseable)
-- a target_year integer.
--
-- Idempotent: re-running leaves the data in the same state via ON CONFLICT.

-- ----------------------------------------------------------------------------
-- 1) Goals
-- ----------------------------------------------------------------------------

INSERT INTO csp_goals (pillar_code, code, name, description, display_order)
VALUES
    -- Community Health & Sustainability
    ('CH', 'CH.1', 'Equitable Public Health Service Delivery',
     'Ensure equitable delivery of core public health services with a focus on reducing disparities in historically marginalized communities.', 1),
    ('CH', 'CH.2', 'Parks, Trails, and Recreational Access',
     'Ensure and preserve equitable access to parks, trails, open space, and recreational opportunities.', 2),
    ('CH', 'CH.3', 'Natural Resources and Climate Mitigation',
     'Protect Austin''s natural resources and ecological systems and mitigate for climate change.', 3),
    ('CH', 'CH.4', 'Community Preparedness and Resiliency',
     'Increase community preparedness to improve resiliency and adaptability to disruptions and disasters.', 4),
    ('CH', 'CH.5', 'Animal Services and Adoption',
     'Operate Austin Animal Center(s) efficiently while providing high-quality care for animals and supporting successful transitions to permanent homes.', 5),

    -- Economic & Workforce Development
    ('EW', 'EW.1', 'Economic Mobility Partnerships and Investments',
     'Equip, empower, and retain the community through partnerships and investments that support economic mobility.', 1),
    ('EW', 'EW.2', 'Resilient Local and BIPOC-Owned Economy',
     'Promote a resilient local economy that prioritizes small and BIPOC-owned (black, indigenous, and people of color) businesses.', 2),
    ('EW', 'EW.3', 'Creative Ecosystem',
     'Preserve and enrich Austin''s creative ecosystem.', 3),

    -- High-Performing Government
    ('HG', 'HG.1', 'Fiscal Integrity and Equitable Resource Allocation',
     'Ensure fiscal integrity and responsibility to equitably meet the diverse needs of all our community.', 1),
    ('HG', 'HG.2', 'Data and Technology Capabilities',
     'Enhance the City''s data and technology capabilities to provide secure, modern, and accessible solutions.', 2),
    ('HG', 'HG.3', 'Workforce Recruitment, Retention, and Engagement',
     'Improve organizational efficiency and capacity by recruiting, hiring, and retaining a talented, engaged, diverse, and inclusive workforce.', 3),
    ('HG', 'HG.4', 'Equitable Outreach and Community Engagement',
     'Provide equitable outreach and collaborative engagement activities to improve service delivery.', 4),

    -- Homelessness & Housing
    ('HH', 'HH.1', 'Equitable Complete Communities',
     'Support equitable complete communities where the necessities of life are accessible and affordable across our rapidly growing city.', 1),
    ('HH', 'HH.2', 'Affordable Housing Development and Preservation',
     'Facilitate and prioritize development and preservation of affordable housing options.', 2),
    ('HH', 'HH.3', 'Reduce Homelessness',
     'Optimize investments, partnerships, and service delivery to reduce the number of people experiencing homelessness in Austin.', 3),

    -- Mobility & Critical Infrastructure
    ('MC', 'MC.1', 'Mobility Safety and Public Health',
     'Design and prioritize mobility improvements that positively impact safety and public health for the community.', 1),
    ('MC', 'MC.2', 'Strengthen the Transportation Network',
     'Strengthen the transportation network through continued investments to support high-capacity transit, airport expansion, and other major mobility initiatives.', 2),
    ('MC', 'MC.3', 'Expand Sustainable Transportation Choices',
     'Expand access to transportation choices that are seamless, sustainable, and easy to navigate.', 3),
    ('MC', 'MC.4', 'Manage and Improve City Facilities',
     'Manage and improve City facilities to ensure a portfolio of safe, reliable, resilient, and sustainable facilities.', 4),
    ('MC', 'MC.5', 'Reliable and Resilient Utility Infrastructure',
     'Provide secure, reliable, and resilient utility infrastructure that cost-effectively serves customers.', 5),

    -- Public Safety
    ('PS', 'PS.1', 'Public Safety Relationships and Shared Responsibility',
     'Improve public safety by building meaningful relationships that create safe communities and a sense of shared responsibility.', 1),
    ('PS', 'PS.2', 'Equitable Evidence-Based Public Safety Delivery',
     'Ensure fair and equitable evidence-based delivery of public safety and court services.', 2),
    ('PS', 'PS.3', 'Hazard Preparedness and Critical Infrastructure',
     'Make strategic investments in partnerships, resources and critical infrastructure to effectively prepare, respond equitably, and adapt to natural and human-made hazards.', 3)
ON CONFLICT (pillar_code, code) DO UPDATE SET
    name          = EXCLUDED.name,
    description   = EXCLUDED.description,
    display_order = EXCLUDED.display_order;

-- ----------------------------------------------------------------------------
-- 2) Measures
-- ----------------------------------------------------------------------------
-- Each row joins to its goal via the dotted code. Re-runnable.

INSERT INTO csp_measures (goal_id, code, name, initial_target, target_year, display_order)
SELECT
    g.id, m.code, m.name, m.initial_target, m.target_year, m.display_order
FROM (VALUES
    -- CH.1
    ('CH.1', 'CH.1.1', 'Public health access points serving marginalized populations',
        '60%', NULL::INT, 1),
    ('CH.1', 'CH.1.2', 'Community recommendations addressed by service delivery changes',
        '25%', NULL::INT, 2),
    -- CH.2
    ('CH.2', 'CH.2.1', 'Resident access to parks and open spaces',
        '71%', NULL::INT, 1),
    ('CH.2', 'CH.2.2', 'Resident access to recreational programs',
        '73%', NULL::INT, 2),
    -- CH.3
    ('CH.3', 'CH.3.1', 'Reduction of community-wide greenhouse gas emissions',
        '< 64% (below 2019 levels by 2028)', 2028, 1),
    ('CH.3', 'CH.3.2', 'Stormwater infiltration into soil toward undeveloped conditions',
        'In Development', NULL, 2),
    ('CH.3', 'CH.3.3', 'City land/easements with implemented ecosystem services plans',
        '85% (long-term target by 2028)', 2028, 3),
    -- CH.4
    ('CH.4', 'CH.4.1', 'Accessible facilities designated as areas of respite',
        '10% annual increase', NULL, 1),
    -- CH.5
    ('CH.5', 'CH.5.1', 'Increase in adoptions vs. previous fiscal year',
        '5%', NULL, 1),
    ('CH.5', 'CH.5.2', 'Increase in free/subsidized spay/neuter surgeries',
        '5%', NULL, 2),

    -- EW.1
    ('EW.1', 'EW.1.1', 'Participants reporting better financial outlook',
        '70%', NULL, 1),
    ('EW.1', 'EW.1.2', 'Participants reporting earnings increase from workforce programs',
        '30%', NULL, 2),
    -- EW.2
    ('EW.2', 'EW.2.1', 'City procurements and grants to BIPOC-owned businesses',
        '10%', NULL, 1),
    -- EW.3
    ('EW.3', 'EW.3.1', 'City-supported spaces utilized by Austin''s creative ecosystem',
        '55%', NULL, 1),

    -- HG.1
    ('HG.1', 'HG.1.1', 'Departments undergoing thorough and just resource allocation analyses',
        'In Development', NULL, 1),
    -- HG.2
    ('HG.2', 'HG.2.1', 'Increase in digital channel interactions for top ten services',
        '5% year-over-year', NULL, 1),
    ('HG.2', 'HG.2.2', 'Increase in adoption of digital workplace tools',
        '5% year-over-year', NULL, 2),
    ('HG.2', 'HG.2.3', 'Project milestones completed implementing modern enterprise solutions',
        '85%', NULL, 3),
    -- HG.3
    ('HG.3', 'HG.3.1', 'Department job requisitions filled within 60 days',
        '75%', NULL, 1),
    ('HG.3', 'HG.3.2', 'Civilian employee year-over-year retention rate',
        '80%', NULL, 2),
    ('HG.3', 'HG.3.3', 'Employees reporting feeling engaged and included at work',
        '75%', NULL, 3),
    -- HG.4
    ('HG.4', 'HG.4.1', 'City-promoted community events held annually at the district level',
        'In Development', NULL, 1),

    -- HH.1
    ('HH.1', 'HH.1.1', 'Residents living in an area considered a complete community',
        '14%', NULL, 1),
    ('HH.1', 'HH.1.2', 'Residents living in an area with an adopted area plan',
        '14%', NULL, 2),
    -- HH.2
    ('HH.2', 'HH.2.1', 'Affordable Housing site plans substantially completed within 285 days',
        '90%', NULL, 1),
    ('HH.2', 'HH.2.2', 'Increase in affordable rental housing units added to inventory',
        '5% annual increase', NULL, 2),
    ('HH.2', 'HH.2.3', 'Increase in affordable ownership housing units added to inventory',
        '5% annual increase', NULL, 3),
    -- HH.3
    ('HH.3', 'HH.3.1', 'Persons in prevention programs not experiencing homelessness within a year',
        '80%', NULL, 1),
    ('HH.3', 'HH.3.2', 'Housing program participants stably housed for two years post-placement',
        '75%', NULL, 2),

    -- MC.1
    ('MC.1', 'MC.1.1', 'Change in serious injuries and fatalities per capita on City roads',
        '5% annual reduction', NULL, 1),
    ('MC.1', 'MC.1.2', 'Change in annualized comprehensive crash costs for safety projects',
        '33% annual reduction', NULL, 2),
    -- MC.2
    ('MC.2', 'MC.2.1', 'Non-local public funding secured for Cap and Stitch, Project Connect, Airport Expansion',
        '50%', NULL, 1),
    -- MC.3
    ('MC.3', 'MC.3.1', 'Community access to robust bicycle, pedestrian, and transit networks',
        '75% (long-term target by 2033)', 2033, 1),
    ('MC.3', 'MC.3.2', 'Community using sustainable modes vs. driving alone for commute',
        '50% (long-term target of 50/50 split by 2039)', 2039, 2),
    -- MC.4
    ('MC.4', 'MC.4.1', 'City facilities rated "Fair or Better" in Facilities Condition Index',
        '50%', NULL, 1),
    ('MC.4', 'MC.4.2', 'Annual improvement in average Energy Star score across enrolled facilities',
        '50%', NULL, 2),
    -- MC.5
    ('MC.5', 'MC.5.1', 'Average outage duration per customer over a 12-month period',
        '< 79 min.', NULL, 1),
    ('MC.5', 'MC.5.2', 'Austin Energy rates remain in bottom 50% statewide; <=2% annual rise',
        '<= 50%', NULL, 2),
    ('MC.5', 'MC.5.3', 'Median household income spent on average annual residential water bill',
        '< 1.5%', NULL, 3),
    ('MC.5', 'MC.5.4', 'Water/wastewater infrastructure in very good, good, or fair condition',
        '> 80%', NULL, 4),

    -- PS.1
    ('PS.1', 'PS.1.1', 'Non-urgent calls into 911 vs. total 911 calls',
        '85%', NULL, 1),
    ('PS.1', 'PS.1.2', 'Annual decrease in crimes against persons citywide',
        '5%', NULL, 2),
    -- PS.2
    ('PS.2', 'PS.2.1', 'Responses meeting predetermined standards for incident types',
        '85%', NULL, 1),
    ('PS.2', 'PS.2.2', 'Alternative public safety dispositions preventing 911 reuse within 30 days',
        '25%', NULL, 2),
    -- PS.3
    ('PS.3', 'PS.3.1', 'Departments complying with emergency preparedness standards',
        '100%', NULL, 1),
    ('PS.3', 'PS.3.2', 'After Action Report recommendations completed within timeframe',
        '100%', NULL, 2),
    ('PS.3', 'PS.3.3', 'Department-identified critical infrastructure with assessed/addressed risks',
        '100%', NULL, 3)
) AS m(goal_code, code, name, initial_target, target_year, display_order)
JOIN csp_goals g ON g.code = m.goal_code
ON CONFLICT (goal_id, code) DO UPDATE SET
    name           = EXCLUDED.name,
    initial_target = EXCLUDED.initial_target,
    target_year    = EXCLUDED.target_year,
    display_order  = EXCLUDED.display_order;
