import { FormEvent, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusCircle, X, Download, ChevronDown, ChevronUp, TrendingUp, PiggyBank, BarChart2, Target, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { play, initSound } from '../lib/sound';

const toRs = (p: number) => `₹${(p/100).toLocaleString('en-IN',{maximumFractionDigits:0})}`;
const toPaise = (s: string|number) => Math.round(Number(s)*100);
const CATS = ['food','travel','movies','fuel','events','shopping','stay','other'] as const;
const CE: Record<string,string> = {food:'🍕',travel:'🚕',movies:'🎬',fuel:'⛽',events:'🎉',shopping:'🛍️',stay:'🏨',other:'📦'};
const CAT_COLORS: Record<string,string> = {food:'var(--color-marigold)',travel:'var(--color-aqua)',movies:'var(--color-hot-pink)',fuel:'var(--color-lime)',events:'#a78bfa',shopping:'#f472b6',stay:'var(--color-mint)',other:'rgba(var(--rt-bone-rgb),0.4)'};

interface Analytics {
  thisMonth:{total:number;count:number};
  categories:{category:string;total:number;count:number}[];
  monthly:{month:string;total:number}[];
  crossSquad:{totalPaid:number;expenseCount:number;totalOwed:number;breakdown:{squad_name:string;emoji:string;paid:number;owed:number}[]};
  budget:{monthly_limit:number|null;savings_goal:number|null;savings_saved:number}|null;
}
interface PersonalExpense{id:string;title:string;amount:number;category:string;note:string|null;expense_date:string}

function ProgressBar({value,max,color='var(--color-marigold)',warn=false}:{value:number;max:number;color?:string;warn?:boolean}){
  const pct=Math.min(100,max>0?Math.round((value/max)*100):0);
  return(
    <div className="relative h-3 overflow-hidden rounded-full" style={{background:'rgba(var(--rt-bone-rgb),0.08)'}}>
      <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8,ease:'easeOut'}}
        className="absolute left-0 top-0 h-full rounded-full"
        style={{background:warn&&pct>=80?'var(--color-hot-pink)':color}}/>
    </div>
  );
}

export default function PersonalFinance(){
  const [open,setOpen]=useState(false);
  const [tab,setTab]=useState<'overview'|'expenses'|'squads'|'budget'>('overview');
  const [analytics,setAna]=useState<Analytics|null>(null);
  const [expenses,setExp]=useState<PersonalExpense[]>([]);
  const [loading,setLoading]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({title:'',amount:'',category:'food',note:'',date:new Date().toISOString().split('T')[0]});
  const [adding,setAdding]=useState(false);
  const [err,setErr]=useState('');
  const [showBudget,setShowBudget]=useState(false);
  const [budgetForm,setBudgetForm]=useState({monthlyLimit:'',savingsGoal:'',savingsSaved:''});
  const [savingBudget,setSavingBudget]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const [ana,exp]=await Promise.all([api<Analytics>('/personal/analytics'),api<{expenses:PersonalExpense[]}>('/personal')]);
      setAna(ana);setExp(exp.expenses);
      if(ana.budget){setBudgetForm({monthlyLimit:ana.budget.monthly_limit?String(ana.budget.monthly_limit/100):'',savingsGoal:ana.budget.savings_goal?String(ana.budget.savings_goal/100):'',savingsSaved:ana.budget.savings_saved?String(ana.budget.savings_saved/100):''});}
    }finally{setLoading(false);}
  };

  useEffect(()=>{if(open)load();},[open]);

  const addExpense=async(e:FormEvent)=>{
    e.preventDefault();
    if(!form.title||!form.amount){setErr('Title aur amount daalo bhai');return;}
    setAdding(true);setErr('');
    try{
      await api('/personal',{method:'POST',body:JSON.stringify({title:form.title,amount:toPaise(form.amount),category:form.category,note:form.note||null,expenseDate:form.date})});
      initSound();play('coin');
      setForm({title:'',amount:'',category:'food',note:'',date:new Date().toISOString().split('T')[0]});
      setShowAdd(false);load();
    }catch(err:any){setErr(err.message);}finally{setAdding(false);}
  };

  const deleteExpense=async(id:string)=>{play('delete');await api(`/personal/${id}`,{method:'DELETE'});load();};

  const saveBudget=async(e:FormEvent)=>{
    e.preventDefault();setSavingBudget(true);
    try{
      await api('/personal/budget',{method:'POST',body:JSON.stringify({monthlyLimit:budgetForm.monthlyLimit?toPaise(budgetForm.monthlyLimit):null,savingsGoal:budgetForm.savingsGoal?toPaise(budgetForm.savingsGoal):null,savingsSaved:budgetForm.savingsSaved?toPaise(budgetForm.savingsSaved):null})});
      play('success');setShowBudget(false);load();
    }finally{setSavingBudget(false);}
  };

  const exportCSV=()=>{
    const rows=[['Title','Amount (Rs)','Category','Note','Date'],...expenses.map(e=>[e.title,(Number(e.amount)/100).toFixed(2),e.category,e.note||'',e.expense_date])];
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='personal-expenses.csv';a.click();URL.revokeObjectURL(url);
  };

  const monthTotal=analytics?.thisMonth.total??0;
  const budgetLimit=analytics?.budget?.monthly_limit??0;
  const budgetPct=budgetLimit>0?Math.round((monthTotal/budgetLimit)*100):0;
  const savingsGoal=analytics?.budget?.savings_goal??0;
  const savingsSaved=analytics?.budget?.savings_saved??0;
  const savingsPct=savingsGoal>0?Math.round((savingsSaved/savingsGoal)*100):0;

  return(
    <div className="rounded-2xl overflow-hidden" style={{border:'2px solid rgba(184,240,42,0.3)',background:'rgba(184,240,42,0.04)'}}>
      <button onClick={()=>{initSound();play('open');setOpen(o=>!o);}}
        className="w-full flex items-center justify-between px-5 py-4 transition hover:bg-white/5 active:scale-[0.99]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{background:'rgba(184,240,42,0.15)',border:'2px solid rgba(184,240,42,0.3)'}}>
            <TrendingUp size={16} color="var(--color-lime)"/>
          </div>
          <div className="text-left">
            <p className="font-display font-extrabold text-sm" style={{color:'var(--color-bone)'}}>My Finance</p>
            {analytics&&!open?(<p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>This month: <span style={{color:'var(--color-lime)'}}>{toRs(monthTotal)}</span>{budgetLimit>0&&<span style={{color:budgetPct>=80?'var(--color-hot-pink)':'rgba(var(--rt-bone-rgb),0.4)'}}> ({budgetPct}% of budget)</span>}</p>):(!analytics&&!open&&<p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>Personal expenses, budget & savings</p>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {budgetPct>=80&&budgetLimit>0&&<AlertTriangle size={14} color="var(--color-hot-pink)"/>}
          {open?<ChevronUp size={16} color="rgba(var(--rt-bone-rgb),0.4)"/>:<ChevronDown size={16} color="rgba(var(--rt-bone-rgb),0.4)"/>}
        </div>
      </button>

      <AnimatePresence>
        {open&&(
          <motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:0.25}} style={{overflow:'hidden'}}>
            <div className="px-5 pb-5">
              <div className="flex gap-1 rounded-xl p-1 mb-4" style={{background:'rgba(var(--rt-bone-rgb),0.05)'}}>
                {(['overview','expenses','squads','budget'] as const).map(t=>(
                  <button key={t} onClick={()=>{play('tap');setTab(t);}} className="flex-1 rounded-lg py-1.5 text-[11px] font-bold capitalize transition"
                    style={{background:tab===t?'var(--color-lime)':'transparent',color:tab===t?'var(--color-ink-950)':'rgba(var(--rt-bone-rgb),0.5)'}}>
                    {t==='squads'?'Squads':t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>

              {loading&&<div className="py-8 text-center text-sm" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>Loading...</div>}

              {!loading&&analytics&&(<>
                {tab==='overview'&&(
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4 space-y-3" style={{background:'rgba(var(--rt-bone-rgb),0.05)',border:'2px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>This Month</p>
                        <p className="text-xs font-bold" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>{analytics.thisMonth.count} expenses</p>
                      </div>
                      <p className="font-display text-2xl font-extrabold" style={{color:'var(--color-lime)'}}>{toRs(analytics.thisMonth.total)}</p>
                      {budgetLimit>0&&(
                        <div>
                          <div className="flex justify-between text-[11px] mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>
                            <span>Budget</span>
                            <span style={{color:budgetPct>=80?'var(--color-hot-pink)':'rgba(var(--rt-bone-rgb),0.5)'}}>{budgetPct}% of {toRs(budgetLimit)}</span>
                          </div>
                          <ProgressBar value={monthTotal} max={budgetLimit} warn/>
                          {budgetPct>=80&&<p className="mt-1.5 text-[11px] font-semibold flex items-center gap-1" style={{color:'var(--color-hot-pink)'}}><AlertTriangle size={11}/>{budgetPct>=100?'Budget exceed ho gaya! 🚨':'Budget almost khatam! 🛑'}</p>}
                        </div>
                      )}
                    </div>
                    {savingsGoal>0&&(
                      <div className="rounded-2xl p-4" style={{background:'rgba(var(--rt-bone-rgb),0.05)',border:'2px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                        <div className="flex items-center gap-2 mb-3"><PiggyBank size={14} color="var(--color-aqua)"/><p className="text-xs font-bold uppercase tracking-wider" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Savings Goal</p></div>
                        <div className="flex justify-between items-end mb-2">
                          <p className="font-display text-lg font-extrabold" style={{color:'var(--color-aqua)'}}>{toRs(savingsSaved)}</p>
                          <p className="text-xs" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>of {toRs(savingsGoal)}</p>
                        </div>
                        <ProgressBar value={savingsSaved} max={savingsGoal} color="var(--color-aqua)"/>
                        <p className="mt-1.5 text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>{savingsPct>=100?'🎉 Goal achieve kar liya!':`${toRs(savingsGoal-savingsSaved)} aur chahiye`}</p>
                      </div>
                    )}
                    {analytics.categories.length>0&&(
                      <div className="rounded-2xl p-4" style={{background:'rgba(var(--rt-bone-rgb),0.05)',border:'2px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                        <div className="flex items-center gap-2 mb-3"><BarChart2 size={14} color="var(--color-marigold)"/><p className="text-xs font-bold uppercase tracking-wider" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Category Breakdown</p></div>
                        <div className="space-y-2.5">
                          {analytics.categories.slice(0,5).map(c=>{
                            const total=analytics.categories.reduce((s,x)=>s+x.total,0);
                            const pct=Math.round((c.total/total)*100);
                            return(<div key={c.category}>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span style={{color:'var(--color-bone)'}}>{CE[c.category]||'📦'} {c.category} <span style={{color:'rgba(var(--rt-bone-rgb),0.35)'}}>({c.count})</span></span>
                                <span style={{color:CAT_COLORS[c.category]||'var(--color-marigold)'}}>{toRs(c.total)} · {pct}%</span>
                              </div>
                              <ProgressBar value={c.total} max={total} color={CAT_COLORS[c.category]||'var(--color-marigold)'}/>
                            </div>);
                          })}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={()=>{setShowAdd(true);play('open');}} className="flex-1 bbtn bbtn-lime gap-1.5 text-xs py-2.5 justify-center"><PlusCircle size={13}/> Add Expense</button>
                      <button onClick={exportCSV} className="bbtn bbtn-ghost gap-1.5 text-xs py-2.5 px-3"><Download size={13}/> Export</button>
                    </div>
                  </div>
                )}

                {tab==='expenses'&&(
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>{expenses.length} personal expenses</p>
                      <button onClick={()=>{setShowAdd(true);play('open');}} className="bbtn bbtn-lime gap-1 px-3 py-1.5 text-xs"><PlusCircle size={12}/> Add</button>
                    </div>
                    {expenses.length===0?(
                      <div className="py-8 text-center"><p className="text-2xl mb-2">💸</p><p className="text-sm" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>Koi personal expense nahi abhi</p></div>
                    ):(
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {expenses.map(e=>(
                          <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{background:'rgba(var(--rt-bone-rgb),0.04)',border:'1.5px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                            <span className="text-lg shrink-0">{CE[e.category]||'📦'}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold" style={{color:'var(--color-bone)'}}>{e.title}</p>
                              <p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.35)'}}>{new Date(e.expense_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}{e.note&&` · ${e.note}`}</p>
                            </div>
                            <p className="font-display font-bold text-sm shrink-0" style={{color:'var(--color-lime)'}}>{toRs(Number(e.amount))}</p>
                            <button onClick={()=>deleteExpense(e.id)} className="shrink-0 rounded-lg p-1.5 transition hover:bg-red-500/20 active:scale-90"><X size={12} color="var(--color-hot-pink)"/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab==='squads'&&(
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4" style={{background:'rgba(var(--rt-bone-rgb),0.05)',border:'2px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                      <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Cross-Squad Summary</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Total I Paid</p><p className="font-display font-extrabold text-lg" style={{color:'var(--color-marigold)'}}>{toRs(analytics.crossSquad.totalPaid)}</p><p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>{analytics.crossSquad.expenseCount} expenses</p></div>
                        <div><p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Total I Owe</p><p className="font-display font-extrabold text-lg" style={{color:'var(--color-hot-pink)'}}>{toRs(analytics.crossSquad.totalOwed)}</p></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {analytics.crossSquad.breakdown.map(sq=>(
                        <div key={sq.squad_name} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{background:'rgba(var(--rt-bone-rgb),0.04)',border:'1.5px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                          <p className="font-bold text-sm" style={{color:'var(--color-bone)'}}>{sq.emoji} {sq.squad_name}</p>
                          <div className="text-right"><p className="text-[11px] font-bold" style={{color:'var(--color-marigold)'}}>Paid {toRs(sq.paid)}</p><p className="text-[11px]" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Owe {toRs(sq.owed)}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab==='budget'&&(
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4" style={{background:'rgba(var(--rt-bone-rgb),0.05)',border:'2px solid rgba(var(--rt-bone-rgb),0.08)'}}>
                      <div className="flex items-center gap-2 mb-3"><Target size={14} color="var(--color-lime)"/><p className="text-xs font-bold uppercase tracking-wider" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Current Settings</p></div>
                      {analytics.budget?(
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm"><span style={{color:'rgba(var(--rt-bone-rgb),0.6)'}}>Monthly Budget</span><span className="font-bold" style={{color:'var(--color-lime)'}}>{analytics.budget.monthly_limit?toRs(analytics.budget.monthly_limit):'Not set'}</span></div>
                          <div className="flex justify-between text-sm"><span style={{color:'rgba(var(--rt-bone-rgb),0.6)'}}>Savings Goal</span><span className="font-bold" style={{color:'var(--color-aqua)'}}>{analytics.budget.savings_goal?toRs(analytics.budget.savings_goal):'Not set'}</span></div>
                          <div className="flex justify-between text-sm"><span style={{color:'rgba(var(--rt-bone-rgb),0.6)'}}>Saved So Far</span><span className="font-bold" style={{color:'var(--color-marigold)'}}>{toRs(analytics.budget.savings_saved)}</span></div>
                        </div>
                      ):<p className="text-sm" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>Abhi koi budget set nahi hai</p>}
                    </div>
                    {!showBudget?(
                      <button onClick={()=>setShowBudget(true)} className="w-full bbtn bbtn-lime justify-center gap-1.5 text-sm"><Target size={14}/>{analytics.budget?'Update Budget & Goals':'Set Budget & Goals'}</button>
                    ):(
                      <form onSubmit={saveBudget} className="space-y-3">
                        {[{key:'monthlyLimit',label:'Monthly Budget (₹)',placeholder:'e.g. 5000',hint:'Isse zyada spend kiya toh alert aayega'},{key:'savingsGoal',label:'Savings Goal (₹)',placeholder:'e.g. 10000',hint:'Kitna bachana chahte ho?'},{key:'savingsSaved',label:'Saved So Far (₹)',placeholder:'e.g. 2000',hint:'Abhi tak kitna bacha liya?'}].map(({key,label,placeholder,hint})=>(
                          <div key={key}>
                            <label className="block text-xs font-bold uppercase tracking-wider mb-1" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>{label}</label>
                            <input type="number" step="0.01" min="0" placeholder={placeholder} value={(budgetForm as any)[key]} onChange={e=>setBudgetForm(f=>({...f,[key]:e.target.value}))} className="binput w-full"/>
                            <p className="text-[11px] mt-0.5" style={{color:'rgba(var(--rt-bone-rgb),0.3)'}}>{hint}</p>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button type="submit" disabled={savingBudget} className="flex-1 bbtn bbtn-lime justify-center text-sm">{savingBudget?'Saving...':'Save ✅'}</button>
                          <button type="button" onClick={()=>setShowBudget(false)} className="bbtn bbtn-ghost px-4 text-sm">Cancel</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdd&&(<>
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-40" style={{background:'rgba(0,0,0,0.75)'}} onClick={()=>setShowAdd(false)}/>
          <motion.div initial={{y:'100%'}} animate={{y:0}} exit={{y:'100%'}} transition={{type:'spring',damping:30,stiffness:340}}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-3xl"
            style={{background:'var(--color-ink-900)',border:'2px solid rgba(var(--rt-bone-rgb),0.15)',borderBottom:'none',maxHeight:'85vh',overflowY:'auto',paddingBottom:'env(safe-area-inset-bottom)'}}>
            <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-10 rounded-full" style={{background:'rgba(var(--rt-bone-rgb),0.2)'}}/></div>
            <div className="flex items-center justify-between px-5 pt-2 pb-4">
              <div><h2 className="font-display text-lg font-extrabold" style={{color:'var(--color-bone)'}}>Personal Kharcha 💸</h2><p className="text-xs" style={{color:'rgba(var(--rt-bone-rgb),0.4)'}}>Sirf tera — squad nahi dekhega</p></div>
              <button onClick={()=>setShowAdd(false)} className="rounded-full p-2" style={{background:'rgba(var(--rt-bone-rgb),0.08)'}}><X size={16} color="rgba(var(--rt-bone-rgb),0.5)"/></button>
            </div>
            <form onSubmit={addExpense} className="px-5 pb-8 space-y-4">
              <div><label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>Kya tha?</label><input type="text" placeholder="Chai, Petrol, Movie ticket..." value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="binput w-full" required/></div>
              <div><label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>Kitna? (₹)</label><input type="number" step="0.01" min="0.01" placeholder="250" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="binput w-full" required/></div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATS.map(c=>(<button key={c} type="button" onClick={()=>setForm(f=>({...f,category:c}))} className="rounded-xl px-3 py-2 text-xs font-bold border-2 transition active:scale-95" style={{borderColor:form.category===c?'var(--color-lime)':'rgba(var(--rt-bone-rgb),0.1)',background:form.category===c?'rgba(184,240,42,0.15)':'rgba(var(--rt-bone-rgb),0.04)',color:form.category===c?'var(--color-lime)':'rgba(var(--rt-bone-rgb),0.6)'}}>{CE[c]} {c}</button>))}
                </div>
              </div>
              <div><label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>Note (optional)</label><input type="text" placeholder="Kal ka udhaar, etc." value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} className="binput w-full"/></div>
              <div><label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'rgba(var(--rt-bone-rgb),0.5)'}}>Date</label><input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} className="binput w-full"/></div>
              {err&&<p className="text-xs font-semibold" style={{color:'var(--color-hot-pink)'}}>{err}</p>}
              <button type="submit" disabled={adding} className="w-full bbtn bbtn-lime justify-center py-3 text-sm">{adding?'Add ho raha hai...':'Kharcha Add Karo ✅'}</button>
            </form>
          </motion.div>
        </>)}
      </AnimatePresence>
    </div>
  );
}
