import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { WALLET_KIND_LABELS } from '../constants/defaultWallets';
import { PeriodFilter, Transaction, WalletAccount } from '../types/finance';
import { formatDateID, formatIDR, getTodayISO } from './formatters';
import { computeWalletBalances } from './walletBalance';

interface PdfExportOptions {
  transactions: Transaction[];
  allTransactions?: Transaction[];
  wallets?: WalletAccount[];
  period: PeriodFilter;
  typeFilter: 'all' | 'income' | 'expense' | 'transfer';
  accountLabel: string;
}

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  '7d': '7 Hari Terakhir',
  '30d': '30 Hari Terakhir',
  month: 'Bulan Berjalan',
  all: 'Semua Periode',
};

export function exportTransactionsToPDF({
  transactions,
  allTransactions,
  wallets = [],
  period,
  typeFilter,
  accountLabel,
}: PdfExportOptions): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const sorted = [...transactions].sort((a, b) => {
    const dtA = `${a.date} ${a.time}`;
    const dtB = `${b.date} ${b.time}`;
    return dtB.localeCompare(dtA);
  });

  const totalIncome = sorted
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = sorted
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const walletSummary =
    wallets.length > 0
      ? computeWalletBalances(wallets, allTransactions || transactions)
      : null;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 34, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('KasHarian — Laporan Keuangan & Aset', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  const filterLabel =
    typeFilter === 'all'
      ? 'Semua Aktivitas'
      : typeFilter === 'income'
      ? 'Khusus Pemasukan'
      : typeFilter === 'expense'
      ? 'Khusus Pengeluaran'
      : 'Khusus Transfer Antar Simpanan';
  doc.text(
    `Periode: ${PERIOD_LABELS[period]}  |  Jenis: ${filterLabel}  |  Akun: ${accountLabel}`,
    14,
    22
  );
  doc.text(`Dicetak pada: ${formatDateID(getTodayISO())}`, 14, 28);

  // Summary Block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Ringkasan Keuangan & Aset', 14, 44);

  const summaryHead = walletSummary
    ? [
        [
          'Total Pemasukan',
          'Total Pengeluaran',
          'Arus Kas Bersih',
          'Total Aset Simpanan',
          'Catatan',
        ],
      ]
    : [['Total Pemasukan', 'Total Pengeluaran', 'Saldo Bersih', 'Jumlah Catatan']];

  const summaryBody = walletSummary
    ? [
        [
          formatIDR(totalIncome),
          formatIDR(totalExpense),
          formatIDR(netBalance),
          formatIDR(walletSummary.totalBalance),
          `${sorted.length} catatan`,
        ],
      ]
    : [
        [
          formatIDR(totalIncome),
          formatIDR(totalExpense),
          formatIDR(netBalance),
          `${sorted.length} catatan`,
        ],
      ];

  autoTable(doc, {
    startY: 47,
    head: summaryHead,
    body: summaryBody,
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 9.5,
      fontStyle: 'bold',
      textColor: [15, 23, 42],
    },
    margin: { left: 14, right: 14 },
  });

  let currentY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY || 68;

  // Asset & Savings Recap Table
  if (walletSummary && walletSummary.items.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Rekapitulasi Aset & Simpanan', 14, currentY + 10);

    const walletRows = walletSummary.items.map((item) => [
      item.wallet.name,
      WALLET_KIND_LABELS[item.wallet.kind],
      formatIDR(item.wallet.initialBalance || 0),
      formatIDR(item.totalIn),
      formatIDR(item.totalOut),
      formatIDR(item.currentBalance),
    ]);

    autoTable(doc, {
      startY: currentY + 13,
      head: [
        [
          'Nama Simpanan',
          'Jenis',
          'Saldo Awal',
          'Dana Masuk',
          'Dana Keluar',
          'Saldo Saat Ini',
        ],
      ],
      body: walletRows,
      theme: 'striped',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: [255, 255, 255],
        fontSize: 8.5,
      },
      bodyStyles: {
        fontSize: 8.5,
      },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: 14, right: 14 },
    });

    currentY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || currentY + 20;
  }

  // Category Breakdown (exclude internal wallet transfers)
  const catMap = new Map<string, { type: string; total: number; count: number }>();
  for (const tx of sorted) {
    if (tx.type === 'transfer') continue;
    const key = `${tx.type}:${tx.categoryName}`;
    const prev = catMap.get(key) || {
      type: tx.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      total: 0,
      count: 0,
    };
    prev.total += tx.amount;
    prev.count += 1;
    catMap.set(key, prev);
  }

  const categoryRows = Array.from(catMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([key, val]) => [
      key.split(':').slice(1).join(':'),
      val.type,
      `${val.count}x`,
      formatIDR(val.total),
    ]);

  if (categoryRows.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Rekapitulasi Pendapatan & Pengeluaran per Kategori', 14, currentY + 10);

    autoTable(doc, {
      startY: currentY + 13,
      head: [['Kategori', 'Jenis', 'Frekuensi', 'Total Nominal']],
      body: categoryRows,
      theme: 'striped',
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8.5,
      },
      columnStyles: {
        2: { halign: 'center' },
        3: { halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    currentY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || currentY + 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Rincian Transaksi & Catatan', 14, currentY + 10);

  const txRows = sorted.map((tx) => {
    const typeLabel =
      tx.type === 'income'
        ? 'Pemasukan'
        : tx.type === 'expense'
        ? 'Pengeluaran'
        : 'Transfer';
    const sourceLabel =
      tx.type === 'transfer'
        ? `${tx.walletName || '-'} -> ${tx.toWalletName || '-'}`
        : tx.walletName
        ? `${tx.walletName}\n${tx.paymentMethod || 'Tunai'}`
        : tx.paymentMethod || 'Tunai';
    const amountLabel =
      tx.type === 'income'
        ? `+ ${formatIDR(tx.amount)}`
        : tx.type === 'expense'
        ? `- ${formatIDR(tx.amount)}`
        : formatIDR(tx.amount);

    return [
      `${formatDateID(tx.date)}\n${tx.time}`,
      typeLabel,
      tx.categoryName,
      sourceLabel,
      tx.note?.trim() ? tx.note.trim() : '-',
      amountLabel,
    ];
  });

  autoTable(doc, {
    startY: currentY + 13,
    head: [['Tanggal', 'Jenis', 'Kategori', 'Simpanan / Metode', 'Catatan', 'Nominal']],
    body:
      txRows.length > 0
        ? txRows
        : [['-', '-', '-', '-', 'Belum ada transaksi pada periode ini', '-']],
    theme: 'striped',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontSize: 8.5,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { cellWidth: 23 },
      1: { cellWidth: 20 },
      2: { cellWidth: 26 },
      3: { cellWidth: 30 },
      4: { cellWidth: 51 },
      5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  const fileName = `Laporan_Keuangan_KasHarian_${getTodayISO()}.pdf`;
  doc.save(fileName);
}
