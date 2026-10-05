'use strict';

require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const TRUST_PROXY = Number.parseInt(process.env.TRUST_PROXY, 10) || 0;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const WEB3FORMS_ACCESS_KEY = process.env.WEB3FORMS_ACCESS_KEY || '';
const WEB3FORMS_ENDPOINT = process.env.WEB3FORMS_ENDPOINT || 'https://api.web3forms.com/submit';
const MESSAGES_FILE = path.resolve(__dirname, process.env.MESSAGES_FILE || './data/messages.jsonl');

const RATE_LIMIT_MAX = Number.parseInt(process.env.RATE_LIMIT_MAX, 10) || 5;
const RATE_LIMIT_WINDOW_MS = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const SUPPORTED_LANGS = ['fr', 'en', 'ar'];

const CONTACT = {
  phone: process.env.CONTACT_PHONE || '+213562451959',
  whatsapp: process.env.CONTACT_WHATSAPP || '213562451959',
  emailPrimary: process.env.CONTACT_EMAIL_PRIMARY || 'info@spectra-dz.com',
  emailSecondary: process.env.CONTACT_EMAIL_SECONDARY || '',
  facebook: process.env.SOCIAL_FACEBOOK || '',
  linkedin: process.env.SOCIAL_LINKEDIN || ''
};

/* ------------------------------------------------------------------ */
/*  Site content (FR / EN / AR)                                        */
/* ------------------------------------------------------------------ */

const WILAYAS = [
  ['01', 'Adrar', 'أدرار'], ['02', 'Chlef', 'الشلف'], ['03', 'Laghouat', 'الأغواط'],
  ['04', 'Oum El Bouaghi', 'أم البواقي'], ['05', 'Batna', 'باتنة'], ['06', 'Béjaïa', 'بجاية'],
  ['07', 'Biskra', 'بسكرة'], ['08', 'Béchar', 'بشار'], ['09', 'Blida', 'البليدة'],
  ['10', 'Bouira', 'البويرة'], ['11', 'Tamanrasset', 'تمنراست'], ['12', 'Tébessa', 'تبسة'],
  ['13', 'Tlemcen', 'تلمسان'], ['14', 'Tiaret', 'تيارت'], ['15', 'Tizi Ouzou', 'تيزي وزو'],
  ['16', 'Alger', 'الجزائر'], ['17', 'Djelfa', 'الجلفة'], ['18', 'Jijel', 'جيجل'],
  ['19', 'Sétif', 'سطيف'], ['20', 'Saïda', 'سعيدة'], ['21', 'Skikda', 'سكيكدة'],
  ['22', 'Sidi Bel Abbès', 'سيدي بلعباس'], ['23', 'Annaba', 'عنابة'], ['24', 'Guelma', 'قالمة'],
  ['25', 'Constantine', 'قسنطينة'], ['26', 'Médéa', 'المدية'], ['27', 'Mostaganem', 'مستغانم'],
  ['28', "M'Sila", 'المسيلة'], ['29', 'Mascara', 'معسكر'], ['30', 'Ouargla', 'ورقلة'],
  ['31', 'Oran', 'وهران'], ['32', 'El Bayadh', 'البيض'], ['33', 'Illizi', 'إليزي'],
  ['34', 'Bordj Bou Arréridj', 'برج بوعريريج'], ['35', 'Boumerdès', 'بومرداس'], ['36', 'El Tarf', 'الطارف'],
  ['37', 'Tindouf', 'تندوف'], ['38', 'Tissemsilt', 'تسمسيلت'], ['39', 'El Oued', 'الوادي'],
  ['40', 'Khenchela', 'خنشلة'], ['41', 'Souk Ahras', 'سوق أهراس'], ['42', 'Tipaza', 'تيبازة'],
  ['43', 'Mila', 'ميلة'], ['44', 'Aïn Defla', 'عين الدفلى'], ['45', 'Naâma', 'النعامة'],
  ['46', 'Aïn Témouchent', 'عين تموشنت'], ['47', 'Ghardaïa', 'غرداية'], ['48', 'Relizane', 'غليزان'],
  ['49', 'Timimoun', 'تيميمون'], ['50', 'Bordj Badji Mokhtar', 'برج باجي مختار'],
  ['51', 'Ouled Djellal', 'أولاد جلال'], ['52', 'Béni Abbès', 'بني عباس'], ['53', 'In Salah', 'عين صالح'],
  ['54', 'In Guezzam', 'عين قزام'], ['55', 'Touggourt', 'تقرت'], ['56', 'Djanet', 'جانت'],
  ['57', "El M'Ghair", 'المغير'], ['58', 'El Menia', 'المنيعة']
].map(([code, fr, ar]) => ({ value: code, label: { fr: `${code} - ${fr}`, en: `${code} - ${fr}`, ar: `${code} - ${ar}` } }));

const ACTIVITIES = [
  { value: 'agro', label: { fr: 'Agroalimentaire', en: 'Food industry', ar: 'الصناعات الغذائية' } },
  { value: 'agriculture', label: { fr: 'Agriculture', en: 'Agriculture', ar: 'الفلاحة' } },
  { value: 'industry', label: { fr: 'Industrie & matières premières', en: 'Industry & raw materials', ar: 'الصناعة والمواد الأولية' } },
  { value: 'construction', label: { fr: 'Matériaux de construction', en: 'Construction materials', ar: 'مواد البناء' } },
  { value: 'environment', label: { fr: 'Environnement & eaux', en: 'Environment & water', ar: 'البيئة والمياه' } },
  { value: 'trade', label: { fr: 'Import / Export', en: 'Import / Export', ar: 'الاستيراد والتصدير' } },
  { value: 'other', label: { fr: 'Autre', en: 'Other', ar: 'أخرى' } }
];

function buildContent() {
  const year = new Date().getFullYear();
  const wa = CONTACT.whatsapp;
  const phoneDisplay = wa.replace(/^213(\d{3})(\d{3})(\d{3})$/, '+213 $1 $2 $3');

  return {
    meta: {
      languages: [
        { code: 'fr', label: 'FR', name: 'Français', dir: 'ltr' },
        { code: 'en', label: 'EN', name: 'English', dir: 'ltr' },
        { code: 'ar', label: 'AR', name: 'العربية', dir: 'rtl' }
      ],
      defaultLang: 'fr',
      generatedAt: new Date().toISOString()
    },

    site: {
      name: 'SPECTRA',
      subName: { fr: 'International Algeria', en: 'International Algeria', ar: 'International Algeria' },
      logo: '/logo.jpg',
      title: {
        fr: 'Spectra International Algeria | Analyses de Laboratoire Internationales',
        en: 'Spectra International Algeria | International Laboratory Analysis',
        ar: 'سبكترا إنترناشيونال الجزائر | تحاليل مخبرية دولية'
      },
      description: {
        fr: "Coordination d'analyses de laboratoire avec des laboratoires accrédités ISO/IEC 17025 en Turquie et en Europe : analyses chimiques, agroalimentaires, environnementales et matériaux industriels.",
        en: 'Coordination of laboratory analyses with ISO/IEC 17025 accredited laboratories in Turkey and Europe: chemical, food, environmental and industrial material testing.',
        ar: 'تنسيق التحاليل المخبرية مع مختبرات معتمدة وفق ISO/IEC 17025 في تركيا وأوروبا: تحاليل كيميائية وغذائية وبيئية ومواد صناعية.'
      },
      footerText: {
        fr: "Coordination d'analyses de laboratoire internationales — Votre pont entre l'Algérie et les laboratoires certifiés ISO en Turquie et en Europe.",
        en: 'International laboratory analysis coordination — Your bridge between Algeria and ISO-certified laboratories in Turkey and Europe.',
        ar: 'تنسيق التحاليل المخبرية الدولية — جسرك بين الجزائر والمختبرات المعتمدة ISO في تركيا وأوروبا.'
      },
      copyright: {
        fr: `© ${year} Spectra International Algeria. Tous droits réservés.`,
        en: `© ${year} Spectra International Algeria. All rights reserved.`,
        ar: `© ${year} سبكترا إنترناشيونال الجزائر. جميع الحقوق محفوظة.`
      }
    },

    ui: {
      nav: [
        { id: 'about', label: { fr: 'Qui sommes-nous', en: 'About us', ar: 'من نحن' } },
        { id: 'services', label: { fr: 'Services', en: 'Services', ar: 'الخدمات' } },
        { id: 'process', label: { fr: 'Processus', en: 'Process', ar: 'آلية العمل' } },
        { id: 'why', label: { fr: 'Pourquoi Spectra', en: 'Why Spectra', ar: 'لماذا سبكترا' } },
        { id: 'contact', label: { fr: 'Contact', en: 'Contact', ar: 'تواصل معنا' } }
      ],
      menu: { fr: 'Ouvrir le menu', en: 'Open menu', ar: 'فتح القائمة' },
      language: { fr: 'Langue', en: 'Language', ar: 'اللغة' },
      whatsappCta: { fr: 'WhatsApp direct', en: 'WhatsApp direct', ar: 'واتساب مباشر' },
      footerContact: { fr: 'Contact', en: 'Contact', ar: 'التواصل' },
      footerSocial: { fr: 'Réseaux sociaux', en: 'Social media', ar: 'التواصل الاجتماعي' },
      footerNav: { fr: 'Navigation', en: 'Navigation', ar: 'التنقل' },
      loading: { fr: 'Chargement…', en: 'Loading…', ar: 'جارٍ التحميل…' }
    },

    hero: {
      badge: {
        fr: 'ISO/IEC 17025 · Laboratoires internationaux',
        en: 'ISO/IEC 17025 · International laboratories',
        ar: 'ISO/IEC 17025 · مختبرات دولية'
      },
      titleLine1: { fr: 'Analyses de laboratoire', en: 'International laboratory', ar: 'تحاليل مخبرية' },
      titleLine2: { fr: 'internationales', en: 'analysis', ar: 'دولية' },
      text: {
        fr: 'Spectra International Algeria coordonne vos analyses industrielles, alimentaires, environnementales et chimiques avec des laboratoires certifiés en Turquie et en Europe.',
        en: 'Spectra International Algeria coordinates your industrial, food, environmental and chemical analyses with certified laboratories in Turkey and Europe.',
        ar: 'سبكترا الجزائر الدولية تنسق تحاليلكم الصناعية والغذائية والبيئية والكيميائية مع مختبرات معتمدة في تركيا وأوروبا.'
      },
      primaryCta: { fr: 'Demander un devis', en: 'Request a quote', ar: 'اطلب عرض سعر' },
      secondaryCta: { fr: 'Voir nos services', en: 'See our services', ar: 'اطلع على خدماتنا' },
      route: {
        title: { fr: "Le trajet de vos échantillons", en: 'The journey of your samples', ar: 'مسار عيناتك' },
        steps: [
          {
            place: { fr: 'Algérie', en: 'Algeria', ar: 'الجزائر' },
            text: { fr: 'Réception et préparation dans toutes les wilayas', en: 'Reception and preparation in every wilaya', ar: 'استقبال وتحضير العينات في جميع الولايات' }
          },
          {
            place: { fr: 'Turquie · Lotuslab', en: 'Turkey · Lotuslab', ar: 'تركيا · Lotuslab' },
            text: { fr: 'Laboratoire accrédité ISO/IEC 17025', en: 'ISO/IEC 17025 accredited laboratory', ar: 'مختبر معتمد وفق ISO/IEC 17025' }
          },
          {
            place: { fr: 'Europe · Eurofins', en: 'Europe · Eurofins', ar: 'أوروبا · Eurofins' },
            text: { fr: 'Laboratoire accrédité ISO/IEC 17025', en: 'ISO/IEC 17025 accredited laboratory', ar: 'مختبر معتمد وفق ISO/IEC 17025' }
          },
          {
            place: { fr: 'Rapport officiel', en: 'Official report', ar: 'التقرير الرسمي' },
            text: { fr: 'Certifié et reconnu à l’international', en: 'Certified and internationally recognized', ar: 'معتمد ومعترف به دوليا' }
          }
        ]
      }
    },

    stats: [
      { value: '50+', label: { fr: "Types d'analyses", en: 'Analysis types', ar: 'نوع تحليل متاح' } },
      { value: '3+', label: { fr: 'Pays collaborateurs', en: 'Partner countries', ar: 'دول التعاون' } },
      { value: 'ISO 17025', label: { fr: 'Laboratoires accrédités', en: 'Accredited laboratories', ar: 'مختبرات معتمدة' } },
      { value: '7/7', label: { fr: 'Suivi et disponibilité', en: 'Support and availability', ar: 'المتابعة والتوفر' } }
    ],

    about: {
      title: { fr: 'Qui sommes-nous', en: 'About us', ar: 'من نحن' },
      subtitle: {
        fr: 'Matériaux analytiques industriels et logistique internationale',
        en: 'Industrial analytical materials and international logistics',
        ar: 'مواد تحليلية صناعية ولوجستيات دولية'
      },
      missionTitle: { fr: 'Notre mission', en: 'Our mission', ar: 'مهمتنا' },
      mission: [
        {
          fr: "Spectra International Algeria est une société spécialisée dans la coordination et la gestion des analyses de laboratoire internationales, et dans le soutien à la conformité analytique des secteurs industriels, agricoles, alimentaires, environnementaux et des matières premières.",
          en: 'Spectra International Algeria is a company specialized in the coordination and management of international laboratory analyses, and in supporting analytical compliance for industrial, agricultural, food, environmental and raw material sectors.',
          ar: 'تُعد Spectra International Algeria شركة متخصصة في تنسيق وإدارة التحاليل المخبرية الدولية، ودعم الامتثال التحليلي للقطاعات الصناعية، الزراعية، الغذائية، البيئية، والمواد الأولية.'
        },
        {
          fr: 'Dans un environnement économique reposant sur la précision et la conformité réglementaire, les analyses de laboratoire ne sont plus de simples procédures techniques, mais des éléments stratégiques pour garantir la qualité des produits, leur sécurité et leur commercialisation sur les marchés locaux et internationaux.',
          en: 'In an economic environment based on precision and regulatory compliance, laboratory analyses are no longer simple technical procedures, but strategic elements to ensure product quality, safety and marketability on local and international markets.',
          ar: 'في بيئة اقتصادية تعتمد على الدقة والامتثال التنظيمي، لم تعد التحاليل المخبرية مجرد إجراء تقني، بل أصبحت عنصرًا استراتيجيًا لضمان جودة المنتجات، سلامتها، وقابليتها للتداول في الأسواق المحلية والدولية.'
        },
        {
          fr: "Nous coordonnons un large éventail d'analyses avancées, en collaboration avec des laboratoires internationaux accrédités selon la norme ISO/IEC 17025. Nous supervisons le processus analytique depuis la coordination des échantillons et leur logistique, jusqu'au suivi technique et à l'émission des rapports accrédités, avec le souci de la précision, de la traçabilité et du respect des normes réglementaires.",
          en: 'We coordinate a wide range of advanced analyses, in collaboration with international laboratories accredited to ISO/IEC 17025. We supervise the analytical process from sample coordination and logistics to technical monitoring and accredited report issuance, ensuring precision, traceability and regulatory compliance.',
          ar: 'ننسق مجموعة واسعة من التحاليل المتقدمة، بالتعاون مع مختبرات دولية معتمدة وفق معيار ISO/IEC 17025. نشرف على العملية التحليلية من مرحلة تنسيق العينات ولوجستياتها، إلى المتابعة الفنية وإصدار التقارير المعتمدة، مع الحرص على الدقة، التتبع، والالتزام بالمعايير التنظيمية ذات الصلة.'
        }
      ],
      visionTitle: { fr: 'Notre vision', en: 'Our vision', ar: 'رؤيتنا' },
      vision: {
        fr: "Chez Spectra, nous croyons que l'analyse de laboratoire n'est pas qu'un chiffre dans un rapport, mais un outil de gestion des risques, d'amélioration des décisions industrielles et de renforcement de la confiance entre producteurs, fabricants et collaborateurs commerciaux. Notre objectif est de fournir une coordination de laboratoire internationale professionnelle.",
        en: 'At Spectra, we believe laboratory analysis is not just a number in a report, but a tool for risk management, improving industrial decisions and building trust between producers, manufacturers and business collaborators. Our goal is to provide professional international laboratory coordination.',
        ar: 'في سبكترا، نؤمن بأن التحليل المخبري ليس مجرد رقم في تقرير، بل هو أداة لإدارة المخاطر، تحسين القرارات الصناعية، وتعزيز الثقة بين المنتجين والمصنعين والمتعاملين تجاريين. هدفنا تقديم تنسيق مخبري دولي احترافي.'
      },
      valuesTitle: { fr: 'Nos engagements', en: 'Our commitments', ar: 'التزاماتنا' },
      values: [
        {
          title: { fr: 'Précision', en: 'Precision', ar: 'الدقة' },
          text: {
            fr: 'Chaque analyse est effectuée avec les techniques les plus avancées par des laboratoires ISO 17025.',
            en: 'Each analysis performed with the most advanced techniques by ISO 17025 certified laboratories.',
            ar: 'كل تحليل يُنجز بأحدث التقنيات من مختبرات معتمدة ISO 17025.'
          }
        },
        {
          title: { fr: 'Accréditation', en: 'Accreditation', ar: 'الاعتماد' },
          text: {
            fr: 'Tous nos laboratoires collaborateurs sont accrédités ISO/IEC 17025, ce qui garantit la reconnaissance internationale des rapports.',
            en: 'All our collaborating laboratories are accredited to ISO/IEC 17025, ensuring international recognition of reports.',
            ar: 'جميع المختبرات التي نتعاون معها معتمدة وفق ISO/IEC 17025، مما يضمن الاعتراف الدولي بالتقارير.'
          }
        },
        {
          title: { fr: 'Coordination internationale', en: 'International coordination', ar: 'التنسيق الدولي' },
          text: {
            fr: 'Un réseau de laboratoires en Turquie et en Europe pour des analyses rapides et fiables.',
            en: 'A network of laboratories in Turkey and Europe for fast and reliable analyses.',
            ar: 'شبكة من المختبرات في تركيا وأوروبا للتحاليل السريعة والموثوقة.'
          }
        },
        {
          title: { fr: 'Transparence', en: 'Transparency', ar: 'الشفافية' },
          text: {
            fr: "Suivi en temps réel de l'avancement des analyses, avec une communication claire et régulière.",
            en: 'Real-time tracking of analysis progress with clear and regular communication.',
            ar: 'متابعة في الوقت الفعلي لتقدم التحاليل مع تواصل واضح ومنتظم.'
          }
        },
        {
          title: { fr: 'Discipline technique', en: 'Technical discipline', ar: 'الانضباط التقني' },
          text: {
            fr: "Rigueur à chaque étape du processus analytique, de la collecte des échantillons à la remise des rapports.",
            en: 'Rigor at every step of the analytical process, from sample collection to report delivery.',
            ar: 'صرامة في كل مرحلة من العملية التحليلية، من جمع العينات إلى تسليم التقارير.'
          }
        }
      ]
    },

    services: {
      tag: { fr: 'Nos expertises', en: 'Our expertise', ar: 'خبراتنا' },
      title: { fr: 'Services analytiques', en: 'Analytical services', ar: 'خدمات تحليلية' },
      subtitle: {
        fr: "De la réception de l'échantillon à la remise du rapport certifié, nous gérons l'ensemble du processus.",
        en: 'From sample reception to certified report delivery, we manage the entire process.',
        ar: 'من استقبال العينة إلى تسليم التقرير المعتمد، نحن ندير العملية بأكملها.'
      },
      items: [
        {
          id: 'chemical',
          title: { fr: 'Analyses chimiques', en: 'Chemical analysis', ar: 'التحاليل الكيميائية' },
          text: {
            fr: "Résidus de pesticides, mycotoxines, métaux lourds, profil d'acides gras, dépistage des OGM.",
            en: 'Pesticide residues, mycotoxins, heavy metals, fatty acid profile, GMO screening.',
            ar: 'بقايا المبيدات، السموم الفطرية، المعادن الثقيلة، تحليل الأحماض الدهنية.'
          }
        },
        {
          id: 'materials',
          title: { fr: 'Matériaux industriels', en: 'Industrial materials', ar: 'المواد الصناعية' },
          text: {
            fr: 'Contrôle qualité des matières premières, des aliments pour animaux et des matériaux de construction.',
            en: 'Quality control of raw materials, animal feed and construction materials.',
            ar: 'مراقبة جودة المواد الخام والأعلاف ومواد البناء.'
          }
        },
        {
          id: 'environment',
          title: { fr: 'Environnement et sol', en: 'Environment and soil', ar: 'البيئة والتربة' },
          text: {
            fr: 'Analyses des eaux souterraines, des eaux traitées, des sols agricoles et industriels.',
            en: 'Analysis of groundwater, treated water, agricultural and industrial soils.',
            ar: 'تحليل المياه الجوفية والمعالجة والتربة الزراعية والصناعية.'
          }
        },
        {
          id: 'shipping',
          title: { fr: "Coordination d'expédition", en: 'Shipping coordination', ar: 'تنسيق الشحن' },
          text: {
            fr: "Gestion complète de la logistique d'expédition des échantillons vers les laboratoires avec lesquels nous collaborons.",
            en: 'Complete management of sample shipping logistics to the laboratories we collaborate with.',
            ar: 'إدارة كاملة للوجستيات شحن العينات نحو المختبرات المتعاون معها.'
          }
        },
        {
          id: 'payments',
          title: { fr: 'Gestion des paiements', en: 'Payment management', ar: 'تسيير المدفوعات' },
          text: {
            fr: 'Traitement des transactions financières internationales avec une transparence totale.',
            en: 'International financial transaction processing with full transparency.',
            ar: 'معالجة المعاملات المالية الدولية بشفافية كاملة وامتثال تنظيمي.'
          }
        }
      ]
    },

    process: {
      title: { fr: 'Comment ça fonctionne', en: 'How it works', ar: 'كيف يعمل ذلك' },
      steps: [
        {
          title: { fr: 'Demande', en: 'Request', ar: 'الطلب' },
          text: { fr: 'Contactez-nous via WhatsApp avec vos besoins', en: 'Contact us via WhatsApp with your needs', ar: 'تواصل معنا عبر واتساب' }
        },
        {
          title: { fr: 'Réception', en: 'Reception', ar: 'الاستقبال' },
          text: { fr: 'Nous réceptionnons et préparons vos échantillons', en: 'We receive and prepare your samples', ar: 'نستقبل ونحضر عيناتك' }
        },
        {
          title: { fr: 'Expédition', en: 'Shipping', ar: 'الشحن' },
          text: { fr: 'Expédition vers les laboratoires certifiés', en: 'Shipping to certified laboratories', ar: 'الشحن إلى المختبرات المعتمدة' }
        },
        {
          title: { fr: 'Analyse', en: 'Analysis', ar: 'التحليل' },
          text: { fr: 'Analyses effectuées par des laboratoires ISO 17025', en: 'Analyses by ISO 17025 laboratories', ar: 'تحاليل من مختبرات ISO 17025' }
        },
        {
          title: { fr: 'Résultats', en: 'Results', ar: 'النتائج' },
          text: { fr: 'Remise des rapports officiels certifiés', en: 'Delivery of official certified reports', ar: 'تسليم التقارير الرسمية المعتمدة' }
        }
      ]
    },

    why: {
      title: { fr: 'Pourquoi choisir Spectra ?', en: 'Why choose Spectra?', ar: 'لماذا تختار سبكترا؟' },
      subtitle: {
        fr: "Nous ne sommes pas un laboratoire — nous sommes votre référence de coordination analytique entre l'Algérie et les meilleurs laboratoires mondiaux.",
        en: "We are not a laboratory — we are your analytical coordination reference between Algeria and the world's best laboratories.",
        ar: 'نحن لسنا مختبراً — نحن جهة التنسيق الموثوقة للتحاليل بين الجزائر وأفضل المختبرات العالمية.'
      },
      items: [
        {
          title: { fr: 'Laboratoires accrédités ISO 17025', en: 'ISO 17025 accredited labs', ar: 'مختبرات معتمدة ISO 17025' },
          text: {
            fr: "Lotuslab et Eurofins sont accrédités ISO/IEC 17025, la norme internationale de référence pour la compétence des laboratoires d'essais.",
            en: 'Lotuslab and Eurofins are accredited to ISO/IEC 17025, the international reference standard for testing laboratory competence.',
            ar: 'Lotuslab وEurofins معتمدان وفق ISO/IEC 17025، المعيار الدولي المرجعي لكفاءة مختبرات الاختبار.'
          }
        },
        {
          title: { fr: 'Coordination logistique complète', en: 'Complete logistics coordination', ar: 'تنسيق لوجستي كامل' },
          text: {
            fr: 'Nous gérons tout : conditionnement des échantillons, expédition internationale, documents douaniers et suivi en temps réel.',
            en: 'We manage everything: packaging, international shipping, customs documents and real-time tracking.',
            ar: 'نحن ندير كل شيء: تغليف العينات، الشحن الدولي، الوثائق الجمركية والتتبع في الوقت الفعلي.'
          }
        },
        {
          title: { fr: 'Rapports reconnus internationalement', en: 'Internationally recognized reports', ar: 'تقارير معترف بها دوليا' },
          text: {
            fr: "Nos rapports d'analyse sont officiels, certifiés et acceptés par les douanes, les ministères et les acheteurs internationaux.",
            en: 'Our reports are official, certified and accepted by customs, ministries and international buyers.',
            ar: 'تقارير التحاليل لدينا رسمية ومعتمدة ومقبولة من الجمارك والوزارات والمشترين الدوليين.'
          }
        },
        {
          title: { fr: 'Un soutien dédié aux entreprises algériennes', en: 'Dedicated support for Algerian companies', ar: 'دعم مخصص للشركات الجزائرية' },
          text: {
            fr: 'Nous comprenons les contraintes locales : réglementation algérienne, transferts bancaires, délais douaniers.',
            en: 'We understand local constraints: Algerian regulations, bank transfers, customs deadlines.',
            ar: 'نفهم القيود المحلية: التشريعات الجزائرية، التحويلات المصرفية، مواعيد الجمارك — ونتولى إدارتها عنكم.'
          }
        }
      ],
      partnersTitle: { fr: 'Laboratoires avec lesquels nous collaborons', en: 'Laboratories we collaborate with', ar: 'المختبرات التي نتعاون معها' },
      partners: [
        { name: 'Lotuslab', detail: { fr: 'ISO/IEC 17025 · Turquie', en: 'ISO/IEC 17025 · Turkey', ar: 'ISO/IEC 17025 · تركيا' } },
        { name: 'Eurofins', detail: { fr: 'ISO/IEC 17025 · Europe', en: 'ISO/IEC 17025 · Europe', ar: 'ISO/IEC 17025 · أوروبا' } }
      ],
      partnersMore: {
        fr: "+ d'autres laboratoires selon le type d'analyse",
        en: '+ other laboratories depending on the analysis type',
        ar: '+ مختبرات أخرى حسب نوع التحليل'
      }
    },

    contact: {
      title: { fr: 'Parlons de vos analyses', en: "Let's talk about your analyses", ar: 'تحدث معنا عن تحاليلك' },
      intro: {
        fr: "Notre équipe est disponible pour répondre à toutes vos questions et préparer votre dossier d'analyse.",
        en: 'Our team is available to answer all your questions and prepare your analysis file.',
        ar: 'فريقنا متاح للإجابة على جميع أسئلتك وإعداد ملف تحليلك.'
      },
      whatsapp: {
        label: 'WhatsApp',
        text: {
          fr: "Le moyen le plus rapide : envoyez vos demandes, photos d'échantillons et questions directement.",
          en: 'The fastest way: send your requests, sample photos and questions directly.',
          ar: 'الطريقة الأسرع: أرسل طلباتك وصور عيناتك وأسئلتك مباشرة.'
        },
        cta: { fr: 'Ouvrir WhatsApp', en: 'Open WhatsApp', ar: 'افتح واتساب' },
        display: phoneDisplay,
        url: `https://wa.me/${wa}`
      },
      phone: { label: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }, display: phoneDisplay, url: `tel:${CONTACT.phone}` },
      emails: [CONTACT.emailPrimary, CONTACT.emailSecondary]
        .filter(Boolean)
        .map((address) => ({ label: { fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' }, display: address, url: `mailto:${address}` })),
      socials: [
        { name: 'Facebook', url: CONTACT.facebook },
        { name: 'LinkedIn', url: CONTACT.linkedin }
      ].filter((social) => social.url),
      areas: {
        title: { fr: "Zones d'intervention", en: 'Service areas', ar: 'مناطق التدخل' },
        text: {
          fr: "Nous intervenons sur tout le territoire algérien. Réception d'échantillons dans toutes les wilayas avec coordination d'expédition internationale vers nos laboratoires partenaires.",
          en: 'We operate throughout Algeria. Sample reception in all wilayas with international shipping coordination to our partner laboratories.',
          ar: 'نتدخل في جميع أنحاء الجزائر. استقبال العينات في جميع الولايات مع تنسيق الشحن الدولي نحو مختبراتنا المتعاون معها.'
        },
        networkTitle: { fr: 'Notre réseau', en: 'Our network', ar: 'شبكتنا' },
        countries: [
          { fr: 'Algérie', en: 'Algeria', ar: 'الجزائر' },
          { fr: 'Turquie', en: 'Turkey', ar: 'تركيا' },
          { fr: 'Allemagne', en: 'Germany', ar: 'ألمانيا' },
          { fr: 'France', en: 'France', ar: 'فرنسا' },
          { fr: 'Pays-Bas', en: 'Netherlands', ar: 'هولندا' },
          { fr: 'Belgique', en: 'Belgium', ar: 'بلجيكا' }
        ]
      },
      guarantees: [
        {
          title: { fr: 'Réponse rapide', en: 'Quick response', ar: 'رد سريع' },
          text: { fr: 'Devis envoyé sous 24 h après réception de votre demande.', en: 'Quote sent within 24 hours of receiving your request.', ar: 'عرض السعر يُرسل خلال 24 ساعة من استلام طلبك.' }
        },
        {
          title: { fr: 'Confidentialité', en: 'Confidentiality', ar: 'السرية' },
          text: { fr: "Toutes vos données et résultats d'analyse sont strictement confidentiels.", en: 'All your data and analysis results are strictly confidential.', ar: 'جميع بياناتك ونتائج تحاليلك سرية تامة.' }
        },
        {
          title: { fr: 'Rapports certifiés', en: 'Certified reports', ar: 'تقارير معتمدة' },
          text: { fr: 'Tous les rapports sont officiels, certifiés ISO et reconnus internationalement.', en: 'All reports are official, ISO certified and internationally recognized.', ar: 'جميع التقارير رسمية ومعتمدة ISO ومعترف بها دوليا.' }
        }
      ],
      form: {
        title: { fr: 'Formulaire de contact', en: 'Contact form', ar: 'نموذج التواصل' },
        intro: {
          fr: 'Remplissez ce formulaire et nous vous contacterons rapidement.',
          en: 'Fill in this form and we will contact you shortly.',
          ar: 'املأ هذا النموذج وسنتواصل معك بسرعة.'
        },
        labels: {
          lastName: { fr: 'Nom', en: 'Last name', ar: 'الاسم' },
          firstName: { fr: 'Prénom', en: 'First name', ar: 'اللقب' },
          activity: { fr: 'Activité / secteur', en: 'Activity / sector', ar: 'النشاط / القطاع' },
          phone: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' },
          email: { fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' },
          wilaya: { fr: 'Wilaya', en: 'Wilaya', ar: 'الولاية' },
          message: { fr: 'Remarques / détails', en: 'Notes / details', ar: 'ملاحظات / التفاصيل' }
        },
        placeholders: {
          phone: { fr: '+213 5XX XXX XXX', en: '+213 5XX XXX XXX', ar: '+213 5XX XXX XXX' },
          email: { fr: 'nom@entreprise.com', en: 'name@company.com', ar: 'name@company.com' },
          activity: { fr: '— Choisir un secteur —', en: '— Select a sector —', ar: '— اختر القطاع —' },
          wilaya: { fr: '— Choisir une wilaya —', en: '— Select a wilaya —', ar: '— اختر الولاية —' },
          message: {
            fr: "Type d'analyse, nature de l'échantillon, quantité, délai souhaité…",
            en: 'Type of analysis, sample nature, quantity, desired deadline…',
            ar: 'نوع التحليل، طبيعة العينة، الكمية، الأجل المطلوب…'
          }
        },
        submit: { fr: 'Envoyer le message', en: 'Send message', ar: 'إرسال الرسالة' },
        sending: { fr: 'Envoi en cours…', en: 'Sending…', ar: 'جارٍ الإرسال…' },
        required: { fr: 'champ obligatoire', en: 'required field', ar: 'حقل إلزامي' },
        success: {
          fr: '✅ Message envoyé ! Nous vous contacterons rapidement.',
          en: '✅ Message sent! We will contact you soon.',
          ar: '✅ تم الإرسال! سنتواصل معك قريباً.'
        },
        errors: {
          required: { fr: 'Ce champ est obligatoire.', en: 'This field is required.', ar: 'هذا الحقل إلزامي.' },
          minLength: { fr: 'Texte trop court.', en: 'Text is too short.', ar: 'النص قصير جدا.' },
          email: { fr: 'Adresse email invalide.', en: 'Invalid email address.', ar: 'عنوان البريد الإلكتروني غير صالح.' },
          phone: { fr: 'Numéro de téléphone invalide.', en: 'Invalid phone number.', ar: 'رقم الهاتف غير صالح.' },
          invalid: { fr: 'Valeur invalide.', en: 'Invalid value.', ar: 'قيمة غير صالحة.' },
          tooMany: {
            fr: 'Trop de messages envoyés. Réessayez dans quelques minutes ou écrivez-nous sur WhatsApp.',
            en: 'Too many messages sent. Try again in a few minutes or write to us on WhatsApp.',
            ar: 'تم إرسال عدد كبير من الرسائل. أعد المحاولة بعد دقائق أو راسلنا عبر واتساب.'
          },
          network: {
            fr: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
            en: 'Unable to connect. Check your network and try again.',
            ar: 'تعذر الاتصال. تحقق من الشبكة ثم أعد المحاولة.'
          },
          server: {
            fr: "Le message n'a pas pu être enregistré. Réessayez ou contactez-nous sur WhatsApp.",
            en: 'Your message could not be saved. Try again or contact us on WhatsApp.',
            ar: 'تعذر حفظ رسالتك. أعد المحاولة أو تواصل معنا عبر واتساب.'
          }
        },
        activities: ACTIVITIES,
        wilayas: WILAYAS
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Contact form: validation, storage, forwarding                      */
/* ------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9 .()-]{6,18}[0-9]$/;

function singleLine(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function multiLine(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function pickLang(value) {
  return SUPPORTED_LANGS.includes(value) ? value : 'fr';
}

function validateContact(body, content) {
  const source = body && typeof body === 'object' ? body : {};
  const lang = pickLang(source.lang);
  const messages = content.contact.form.errors;
  const errors = {};

  const data = {
    lastName: singleLine(source.lastName, 60),
    firstName: singleLine(source.firstName, 60),
    activity: singleLine(source.activity, 30),
    phone: singleLine(source.phone, 24),
    email: singleLine(source.email, 120).toLowerCase(),
    wilaya: singleLine(source.wilaya, 3),
    message: multiLine(source.message, 2000)
  };

  const fail = (field, key) => {
    errors[field] = messages[key][lang];
  };

  if (!data.lastName) fail('lastName', 'required');
  else if (data.lastName.length < 2) fail('lastName', 'minLength');

  if (!data.firstName) fail('firstName', 'required');
  else if (data.firstName.length < 2) fail('firstName', 'minLength');

  if (!data.activity) fail('activity', 'required');
  else if (!ACTIVITIES.some((item) => item.value === data.activity)) fail('activity', 'invalid');

  if (!data.phone) fail('phone', 'required');
  else if (!PHONE_PATTERN.test(data.phone)) fail('phone', 'phone');

  if (!data.email) fail('email', 'required');
  else if (!EMAIL_PATTERN.test(data.email)) fail('email', 'email');

  if (!data.wilaya) fail('wilaya', 'required');
  else if (!WILAYAS.some((item) => item.value === data.wilaya)) fail('wilaya', 'invalid');

  if (!data.message) fail('message', 'required');
  else if (data.message.length < 10) fail('message', 'minLength');

  return { lang, data, errors, valid: Object.keys(errors).length === 0 };
}

async function saveMessage(record) {
  await fs.promises.mkdir(path.dirname(MESSAGES_FILE), { recursive: true });
  await fs.promises.appendFile(MESSAGES_FILE, `${JSON.stringify(record)}\n`, 'utf8');
}

async function forwardToWeb3Forms(record) {
  if (!WEB3FORMS_ACCESS_KEY) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const activityLabel = ACTIVITIES.find((item) => item.value === record.activity);
    const wilayaLabel = WILAYAS.find((item) => item.value === record.wilaya);

    const response = await fetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: `Nouveau message du site - ${record.firstName} ${record.lastName}`,
        from_name: 'Site Spectra International',
        name: `${record.firstName} ${record.lastName}`,
        email: record.email,
        phone: record.phone,
        activity: activityLabel ? activityLabel.label.fr : record.activity,
        wilaya: wilayaLabel ? wilayaLabel.label.fr : record.wilaya,
        message: record.message,
        language: record.lang,
        botcheck: ''
      }),
      signal: controller.signal
    });

    const result = await response.json().catch(() => ({}));
    return response.ok && result.success !== false;
  } catch (error) {
    console.error('[contact] Web3Forms indisponible :', error.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/*  Rate limiting (en memoire, sans dependance externe)                */
/* ------------------------------------------------------------------ */

const rateBuckets = new Map();

function contactRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  let bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > RATE_LIMIT_MAX) {
    const lang = pickLang(req.body && req.body.lang);
    const content = buildContent();
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({
      success: false,
      message: content.contact.form.errors.tooMany[lang]
    });
  }

  return next();
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

/* ------------------------------------------------------------------ */
/*  Application Express                                                */
/* ------------------------------------------------------------------ */

const app = express();

app.disable('x-powered-by');
if (TRUST_PROXY > 0) app.set('trust proxy', TRUST_PROXY);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: IS_PROD ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  '/api',
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      return callback(null, ALLOWED_ORIGINS.includes(origin));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600
  })
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), environment: NODE_ENV });
});

app.get('/api/content', (req, res) => {
  res.set('Cache-Control', IS_PROD ? 'public, max-age=300' : 'no-store');
  res.json(buildContent());
});

app.post('/api/contact', express.json({ limit: '20kb' }), contactRateLimit, async (req, res) => {
  const content = buildContent();
  const { lang, data, errors, valid } = validateContact(req.body, content);

  if (req.body && typeof req.body.website === 'string' && req.body.website.trim() !== '') {
    return res.status(201).json({ success: true, message: content.contact.form.success[lang] });
  }

  if (!valid) {
    return res.status(400).json({
      success: false,
      message: content.contact.form.errors.invalid[lang],
      errors
    });
  }

  const record = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    ip: req.ip,
    lang,
    ...data
  };

  let saved = false;
  try {
    await saveMessage(record);
    saved = true;
  } catch (error) {
    console.error('[contact] Ecriture du fichier impossible :', error.message);
  }

  const emailed = await forwardToWeb3Forms(record);

  if (!saved && !emailed) {
    return res.status(500).json({
      success: false,
      message: content.contact.form.errors.server[lang]
    });
  }

  console.log(`[contact] ${record.id} recu (fichier: ${saved ? 'oui' : 'non'}, email: ${emailed ? 'oui' : 'non'})`);
  return res.status(201).json({ success: true, id: record.id, message: content.contact.form.success[lang] });
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route introuvable.' });
});

app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    etag: true,
    maxAge: IS_PROD ? '1h' : 0
  })
);

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  return res.status(404).type('text/plain').send('Not found');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'JSON invalide.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Requête trop volumineuse.' });
  }
  console.error('[server] Erreur non gérée :', err);
  return res.status(500).json({ success: false, message: 'Erreur interne du serveur.' });
});

/* ------------------------------------------------------------------ */
/*  Démarrage                                                          */
/* ------------------------------------------------------------------ */

function start() {
  const server = app.listen(PORT, () => {
    console.log(`Spectra International - serveur démarré sur http://localhost:${PORT} (${NODE_ENV})`);
    if (!WEB3FORMS_ACCESS_KEY) {
      console.warn('[contact] WEB3FORMS_ACCESS_KEY est vide : les messages seront seulement archivés dans le fichier.');
    }
  });

  const shutdown = (signal) => {
    console.log(`${signal} reçu, arrêt du serveur...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
